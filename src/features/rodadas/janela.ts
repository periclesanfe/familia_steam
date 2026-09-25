import 'server-only'

import { exigir } from '@/domain/erros'
import { deDb, prazoConfirmacao } from '@/domain/tempo'
import type { ContextoAcao } from '@/server/acao'
import { registrarEvento } from '@/server/auditoria'
import { db } from '@/server/db'
import { emTransacao, travar } from '@/server/tx'

const APTOS = { status: { in: ['ATIVO' as const, 'IMPOSSIBILITADO' as const] } }

/**
 * RN-CIC-05 (art. 44; D-17): na janela de revisão cada membro confirma ou recusa o ciclo
 * PLANEJADO e pode mudar de ideia até `prazoConfirmacao(dataInicio)`. A resposta nova revoga a
 * anterior. Lock da rodada 1: o corte (iniciarCiclo) lê as confirmações sob o mesmo lock.
 */
export async function responderProximoCiclo(
  ctx: ContextoAcao,
  e: { cicloId: string; confirma: boolean },
): Promise<void> {
  return emTransacao(async (tx) => {
    const rodada1 = await tx.rodada.findFirstOrThrow({
      where: { cicloId: e.cicloId, sequencia: 1 },
      select: { id: true },
    })
    await travar(tx, `rodada:${rodada1.id}`)
    const ciclo = await tx.ciclo.findUniqueOrThrow({
      where: { id: e.cicloId },
      select: { numero: true, status: true, dataInicio: true },
    })
    exigir(
      ciclo.status === 'PLANEJADO' &&
        ciclo.numero > 1 &&
        ctx.agora < prazoConfirmacao(deDb(ciclo.dataInicio)),
      'ENTRADA_INVALIDA',
      'A janela de confirmação deste ciclo não está aberta.',
      'art. 44',
    )
    const eu = ctx.ator.pessoaId
    exigir(await tx.membro.count({ where: { pessoaId: eu, ...APTOS } }), 'SEM_PERMISSAO')
    await tx.declaracao.updateMany({
      where: {
        pessoaId: eu,
        cicloId: e.cicloId,
        tipo: { in: ['CONFIRMA_PROXIMO_CICLO', 'RECUSA_PROXIMO_CICLO'] },
        revogadaEm: null,
      },
      data: { revogadaEm: ctx.agora },
    })
    const tipo = e.confirma ? 'CONFIRMA_PROXIMO_CICLO' : 'RECUSA_PROXIMO_CICLO'
    const d = await tx.declaracao.create({
      data: {
        tipo,
        pessoaId: eu,
        cicloId: e.cicloId,
        efetivaEm: ctx.agora,
        registradaEm: ctx.agora,
        registradaPorId: eu,
      },
      select: { id: true },
    })
    await registrarEvento(tx, ctx, {
      acao: `declaracao.${tipo.toLowerCase()}`,
      entidade: 'declaracao',
      entidadeId: d.id,
      dados: { depois: { cicloId: e.cicloId } },
    })
  })
}

/** 07 §3.5: janela de revisão do ciclo `numero` (EM_REVISAO) sobre o seguinte PLANEJADO. */
export async function janelaDeRevisao(numero: number, pessoaId: string, agora: Date) {
  const [atual, seguinte] = await Promise.all([
    db.ciclo.findUnique({ where: { numero }, select: { status: true } }),
    db.ciclo.findFirst({
      where: { numero: numero + 1, status: 'PLANEJADO' },
      select: {
        id: true,
        numero: true,
        dataInicio: true,
        declaracoes: {
          where: {
            tipo: { in: ['CONFIRMA_PROXIMO_CICLO', 'RECUSA_PROXIMO_CICLO'] },
            revogadaEm: null,
          },
          select: { pessoaId: true, tipo: true },
        },
      },
    }),
  ])
  if (atual?.status !== 'EM_REVISAO' || !seguinte) return null
  const membros = await db.membro.findMany({
    where: APTOS,
    select: { pessoaId: true, pessoa: { select: { apelido: true } } },
    orderBy: { pessoa: { apelido: 'asc' } },
  })
  const resposta = new Map(seguinte.declaracoes.map((d) => [d.pessoaId, d.tipo]))
  const prazo = prazoConfirmacao(deDb(seguinte.dataInicio))
  return {
    cicloId: seguinte.id,
    numero: seguinte.numero,
    dataInicio: deDb(seguinte.dataInicio),
    prazo,
    aberta: agora < prazo,
    membros: membros.map((m) => ({
      pessoaId: m.pessoaId,
      apelido: m.pessoa.apelido,
      eu: m.pessoaId === pessoaId,
      resposta: resposta.get(m.pessoaId) ?? null,
    })),
  }
}
