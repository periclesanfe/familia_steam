import 'server-only'

import { processarFechamentos } from '@/features/compra/fechamento'
import { verificarCompras } from '@/features/compra/verificacao'
import { caducarIndicacoes } from '@/features/familias/servico'
import { recalcularAgendamentos } from '@/features/rodadas/ciclo'
import { executarRodada } from '@/features/rodadas/servico'
import { atualizarApps, pessoasVencidas, sincronizarPessoas } from '@/features/steam/sync'
import { fecharVotacoesVencidas } from '@/features/votacoes/servico'

import { db, dbBase } from './db'
import { env } from './env'
import { comFamilia } from './familia'
import { log } from './log'
import { agora } from './relogio'

const LEASE_MS = 2 * 60_000
const UM_DIA_MS = 86_400_000

export type ResumoTick =
  | { executou: false; motivo: 'LEASE_OCUPADO' }
  | {
      executou: true
      votacoesEncerradas: number
      sorteios: { rodadaId: string; status: string }[]
      erros: string[]
      limpeza: number
    }

/**
 * 08 §7 / ADR-002: job idempotente. Lease em `controle` (advisory lock de sessão falha com
 * pool). Cada passo é uma transação curta; uma falha num passo não impede os outros (CA-150).
 */
export async function executarTick(): Promise<ResumoTick> {
  const inicio = agora()
  const pegou = await db.$queryRaw<{ ok: number }[]>`
    UPDATE controle SET ate = ${new Date(inicio.getTime() + LEASE_MS)}
    WHERE chave = 'tick' AND (ate IS NULL OR ate < ${inicio}) RETURNING 1 AS ok`
  if (pegou.length === 0) return { executou: false, motivo: 'LEASE_OCUPADO' }

  const erros: string[] = []
  const sorteios: { rodadaId: string; status: string }[] = []
  const acumulado = { votacoesEncerradas: 0 }
  try {
    // 15 §4: os passos do consórcio rodam família por família (RLS); a Steam é global
    const familias = await dbBase.familia.findMany({ select: { id: true } })
    for (const f of familias) {
      // eslint-disable-next-line no-await-in-loop -- famílias em sequência: cada uma com transações curtas
      await comFamilia(f.id, () => passosDaFamilia(erros, sorteios, acumulado))
    }
    // 5b. Steam global: até 20 apps por execução (RN-STM-10)
    try {
      await atualizarApps(20)
    } catch (e) {
      erros.push(`steam: ${e instanceof Error ? e.message : 'erro'}`)
    }
    // 6. limpeza
    const t = agora()
    const [nonces, sessoes] = await Promise.all([
      db.nonceOpenId.deleteMany({ where: { usadoEm: { lt: new Date(t.getTime() - UM_DIA_MS) } } }),
      db.sessao.deleteMany({ where: { expiraEm: { lt: t } } }),
    ])
    await db.controle.update({
      where: { chave: 'ultimo_tick' },
      data: { valor: { em: t.toISOString(), erros: erros.length } },
    })
    if (erros.length) log.erro('tick.erros', { quantidade: erros.length })
    return {
      executou: true,
      votacoesEncerradas: acumulado.votacoesEncerradas,
      sorteios,
      erros,
      limpeza: nonces.count + sessoes.count,
    }
  } finally {
    await db.controle.update({ where: { chave: 'tick' }, data: { ate: null } })
  }
}

/** Passos 1–5 de uma família (08 §7), com o contexto de família já definido. */
async function passosDaFamilia(
  erros: string[],
  sorteios: { rodadaId: string; status: string }[],
  acumulado: { votacoesEncerradas: number },
) {
  const sistema = () => ({ ator: { tipo: 'SISTEMA' as const }, agora: agora() })
  // 1. votações vencidas (RN-VOT-13): ATA por PRAZO
  const votacoes = await fecharVotacoesVencidas()
  erros.push(...votacoes.erros)
  acumulado.votacoesEncerradas += votacoes.encerradas
  // 2. horário das agendadas pela versão vigente (RN-SOR-01) e sorteios devidos, em ordem
  await recalcularAgendamentos(sistema()).catch((e: unknown) => {
    erros.push(`reagendamento: ${e instanceof Error ? e.message : 'erro'}`)
  })
  const devidas = await db.rodada.findMany({
    where: { status: 'AGENDADA', agendadaPara: { lte: agora() } },
    orderBy: [{ ciclo: { numero: 'asc' } }, { sequencia: 'asc' }],
    select: { id: true },
  })
  for (const r of devidas) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sequencial por regra (RN-SOR-02: ordem de sequência)
      const res = await executarRodada(r.id, null)
      sorteios.push({ rodadaId: r.id, status: res.status })
    } catch (e) {
      erros.push(`sorteio ${r.id}: ${e instanceof Error ? e.message : 'erro'}`)
    }
  }
  // 3. fechamentos (RN-FIN-13) e 4. rede de segurança de SOBRA (RN-FIN-14/16)
  const fechamentos = await processarFechamentos(sistema())
  erros.push(...fechamentos.erros)
  // RN-FAM-05: indicações sem decisão em 7 dias
  await caducarIndicacoes(sistema())
  // 5. Steam da família: perfis vencidos (> 24 h, precisa de key) e verificação pós-compra
  try {
    if (env().STEAM_API_KEY) await sincronizarPessoas(await pessoasVencidas(agora()))
    await verificarCompras(agora()) // RN-COM-11
  } catch (e) {
    erros.push(`steam: ${e instanceof Error ? e.message : 'erro'}`)
  }
}
