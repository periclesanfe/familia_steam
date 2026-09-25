import 'server-only'

import type { Parametros } from '@/domain/regulamento'
import {
  dataLocal,
  instanteLocal,
  mesDe,
  paraDb,
  primeiroDiaApos,
  somarDiasCorridos,
} from '@/domain/tempo'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/** "AAAA-MM" do mês seguinte. */
export function mesSeguinte(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  return m === 12 ? `${String(a + 1)}-01` : `${String(a)}-${doisDigitos(m + 1)}`
}

/** RN-SOR-01: diaSorteio do mês às horaSorteio (SP), pela versão vigente. */
export const agendamento = (mes: string, p: Parametros): Date =>
  instanteLocal(`${mes}-${doisDigitos(p.diaSorteio)}`, p.horaSorteio)

/**
 * RN-SOR-10.4: regra única de criação da próxima rodada (também na RN-SOR-11). Não duplica se
 * já existir no ciclo rodada não ANULADA/CANCELADA com a sequência seguinte.
 */
export async function criarProximaRodada(
  tx: Tx,
  ctx: Contexto,
  r: { cicloId: string; sequencia: number; mesReferencia: string },
  p: Parametros,
): Promise<void> {
  const sequencia = r.sequencia + 1
  const existe = await tx.rodada.findFirst({
    where: { cicloId: r.cicloId, sequencia, status: { notIn: ['ANULADA', 'CANCELADA'] } },
    select: { id: true },
  })
  if (existe) return
  const mesReferencia = mesSeguinte(r.mesReferencia)
  const nova = await tx.rodada.create({
    data: {
      cicloId: r.cicloId,
      sequencia,
      mesReferencia,
      agendadaPara: agendamento(mesReferencia, p),
    },
    select: { id: true },
  })
  await registrarEvento(tx, ctx, {
    acao: 'rodada.agendar',
    entidade: 'rodada',
    entidadeId: nova.id,
    dados: { depois: { sequencia, mesReferencia } },
  })
}

/**
 * RN-CIC-04: NC vazio conclui o ciclo. Com semCicloSeguinte, ENCERRADO; senão EM_REVISAO e
 * nasce o ciclo seguinte no primeiro dia 3 ≥ conclusão + 8 dias (janela de ≥ 7 dias, D-17).
 */
export async function concluirCiclo(
  tx: Tx,
  ctx: Contexto,
  ciclo: { id: string; numero: number; semCicloSeguinte: boolean },
  p: Parametros,
): Promise<void> {
  const T = ctx.agora
  await tx.rodada.updateMany({
    where: { cicloId: ciclo.id, status: 'AGENDADA' },
    data: { status: 'CANCELADA' },
  })
  if (ciclo.semCicloSeguinte) {
    await tx.ciclo.update({
      where: { id: ciclo.id },
      data: { status: 'ENCERRADO', concluidoEm: T, encerradoEm: T },
    })
    // ponytail: rateio da SOBRA (RN-FIN-17) entra no M7/M8b
  } else {
    await tx.ciclo.update({
      where: { id: ciclo.id },
      data: { status: 'EM_REVISAO', concluidoEm: T },
    })
    const dataInicio = primeiroDiaApos(somarDiasCorridos(dataLocal(T), 7), p.diaSorteio)
    const seguinte = await tx.ciclo.create({
      data: {
        numero: ciclo.numero + 1,
        dataInicio: paraDb(dataInicio),
        status: 'PLANEJADO',
        rodadas: {
          create: {
            sequencia: 1,
            mesReferencia: mesDe(dataInicio),
            agendadaPara: instanteLocal(dataInicio, p.horaSorteio),
          },
        },
      },
      select: { id: true },
    })
    await registrarEvento(tx, ctx, {
      acao: 'ciclo.criar',
      entidade: 'ciclo',
      entidadeId: seguinte.id,
      dados: { depois: { numero: ciclo.numero + 1, dataInicio } },
    })
  }
  await registrarEvento(tx, ctx, {
    acao: 'ciclo.concluir',
    entidade: 'ciclo',
    entidadeId: ciclo.id,
    dados: { depois: { semCicloSeguinte: ciclo.semCicloSeguinte } },
  })
}

/**
 * RN-CIC-02/03/06/07/08: corte da 1ª rodada de um ciclo PLANEJADO. Os previstos viram
 * participantes; com menos de 2, o ciclo é cancelado. Devolve false quando cancelou.
 */
export async function iniciarCiclo(
  tx: Tx,
  ctx: Contexto,
  ciclo: { id: string; numero: number },
  rodadaId: string,
): Promise<boolean> {
  const T = ctx.agora
  const aptos = { status: { in: ['ATIVO' as const, 'IMPOSSIBILITADO' as const] } }
  const membros =
    ciclo.numero === 1
      ? await tx.membro.findMany({
          where: { origem: 'FUNDADOR', ...aptos },
          select: { id: true, pessoaId: true },
        })
      : await tx.membro.findMany({ where: aptos, select: { id: true, pessoaId: true } })
  let previstos = membros
  if (ciclo.numero > 1) {
    const confirmaram = new Set(
      (
        await tx.declaracao.findMany({
          where: {
            tipo: 'CONFIRMA_PROXIMO_CICLO',
            cicloId: ciclo.id,
            revogadaEm: null,
            pessoaId: { in: membros.map((m) => m.pessoaId) },
          },
          select: { pessoaId: true },
        })
      ).map((d) => d.pessoaId),
    )
    previstos = membros.filter((m) => confirmaram.has(m.pessoaId))
    // RN-CIC-06: quem não confirmou encerra agora, sem saiuEm (a família não muda)
    const naoConfirmaram = membros.filter((m) => !confirmaram.has(m.pessoaId))
    if (naoConfirmaram.length > 0) {
      await tx.membro.updateMany({
        where: { id: { in: naoConfirmaram.map((m) => m.id) } },
        data: { status: 'ENCERRADO', encerradoEm: T, motivoEncerramento: 'NAO_CONFIRMOU_ART44' },
      })
    }
    // ponytail: admitidos AGUARDANDO_CICLO (RN-CAD-12.4) entram no M8b
  }

  const anterior = await tx.ciclo.findFirst({
    where: { numero: ciclo.numero - 1, status: 'EM_REVISAO' },
    select: { id: true },
  })
  if (previstos.length < 2) {
    // RN-CIC-07: sem ciclo seguinte
    await tx.rodada.update({ where: { id: rodadaId }, data: { status: 'CANCELADA' } })
    await tx.ciclo.update({ where: { id: ciclo.id }, data: { status: 'CANCELADO' } })
    if (anterior) {
      await tx.ciclo.update({
        where: { id: anterior.id },
        data: { status: 'ENCERRADO', encerradoEm: T, semCicloSeguinte: true },
      })
    }
    await registrarEvento(tx, ctx, {
      acao: 'ciclo.cancelar',
      entidade: 'ciclo',
      entidadeId: ciclo.id,
      dados: { motivo: `${String(previstos.length)} participante(s) no corte (RN-CIC-07)` },
    })
    return false
  }

  await tx.participacaoCiclo.createMany({
    data: previstos.map((m) => ({ cicloId: ciclo.id, pessoaId: m.pessoaId, entrouEm: T })),
  })
  await tx.ciclo.update({ where: { id: ciclo.id }, data: { status: 'EM_ANDAMENTO' } })
  if (anterior) {
    await tx.ciclo.update({
      where: { id: anterior.id },
      data: { status: 'ENCERRADO', encerradoEm: T },
    })
  }
  await registrarEvento(tx, ctx, {
    acao: 'ciclo.iniciar',
    entidade: 'ciclo',
    entidadeId: ciclo.id,
    dados: { depois: { participantes: previstos.length } },
  })
  return true
}
