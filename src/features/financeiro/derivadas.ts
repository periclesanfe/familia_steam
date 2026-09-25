import 'server-only'

import { dataLocal, fimDoDia } from '@/domain/tempo'
import type { Prisma } from '@/generated/prisma/client'
import type { TipoObrigacao } from '@/generated/prisma/enums'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'

/** RN-FIN-06 em forma de filtro: forma diversa só conta confirmada; INVALIDADO nunca. */
export const CONTA = {
  OR: [
    { status: { in: ['DECLARADO', 'CONTESTADO'] }, formaDiversa: false },
    { status: 'CONFIRMADO' },
  ],
} satisfies Prisma.PagamentoWhereInput

/** Tipos cujo credor é o contemplado vigente e que a cessão redireciona (RN-CES-05.4). */
export const REDIRECIONAVEIS: TipoObrigacao[] = ['CONTRIBUICAO', 'SOBRA', 'REPASSE_CESSAO']

/** REPASSE_CESSAO ou DEVOLUCAO nascida de um pagamento; vence no fim do dia do evento (+7 com justificativa). */
export async function criarDerivada(
  tx: Tx,
  ctx: Contexto,
  e: {
    tipo: 'REPASSE_CESSAO' | 'DEVOLUCAO'
    rodadaId: string
    devedorId: string
    credorId: string
    valorCentavos: number
    pagamentoOrigemId: string
    ataNumero?: number | undefined
  },
) {
  const o = await tx.obrigacao.create({
    data: {
      ...e,
      vencimentoEm: fimDoDia(dataLocal(ctx.agora)),
      criadaEm: ctx.agora,
    },
    select: { id: true },
  })
  await registrarEvento(tx, ctx, {
    acao: `obrigacao.${e.tipo.toLowerCase()}`,
    entidade: 'obrigacao',
    entidadeId: o.id,
    dados: { depois: { ...e } },
    ...(e.ataNumero ? { ataNumero: e.ataNumero } : {}),
  })
}

/**
 * O pagamento acabou de passar a contar (registro, forma diversa confirmada, ATA).
 * - Em obrigação cancelada por cessão/anulação: DEVOLUCAO recebedor → devedor (RN-FIN-04).
 * - Pago a quem não é mais o contemplado vigente: REPASSE_CESSAO recebedor → vigente (RN-CES-05.6).
 */
export async function aoPassarAContar(tx: Tx, ctx: Contexto, pagamentoId: string) {
  const p = await tx.pagamento.findUniqueOrThrow({
    where: { id: pagamentoId },
    select: {
      id: true,
      recebedorId: true,
      valorCentavos: true,
      obrigacao: {
        select: {
          tipo: true,
          rodadaId: true,
          devedorId: true,
          canceladaEm: true,
          rodada: { select: { contempladoId: true } },
        },
      },
    },
  })
  const o = p.obrigacao
  const base = { rodadaId: o.rodadaId, valorCentavos: p.valorCentavos, pagamentoOrigemId: p.id }
  if (o.canceladaEm) {
    await criarDerivada(tx, ctx, {
      ...base,
      tipo: 'DEVOLUCAO',
      devedorId: p.recebedorId,
      credorId: o.devedorId,
    })
    return
  }
  const vigente = o.rodada.contempladoId
  if (REDIRECIONAVEIS.includes(o.tipo) && vigente && p.recebedorId !== vigente) {
    // em A→B→C, um Pix a A registrado depois gera A→C, nunca A→B (CA-157)
    await criarDerivada(tx, ctx, {
      ...base,
      tipo: 'REPASSE_CESSAO',
      devedorId: p.recebedorId,
      credorId: vigente,
    })
  }
}

/**
 * RN-FIN-05 (efeito da invalidação): cancela as derivadas do pagamento; para cada pagamento que
 * contava nelas, primeiro a mesma regra (recursiva) e depois a DEVOLUCAO recebedor → devedor.
 */
export async function aoInvalidar(
  tx: Tx,
  ctx: Contexto,
  pagamentoId: string,
  ataNumero?: number,
): Promise<void> {
  const derivadas = await tx.obrigacao.findMany({
    where: { pagamentoOrigemId: pagamentoId, canceladaEm: null },
    select: {
      id: true,
      rodadaId: true,
      devedorId: true,
      pagamentos: { where: CONTA, select: { id: true, recebedorId: true, valorCentavos: true } },
    },
  })
  if (derivadas.length === 0) return
  await tx.obrigacao.updateMany({
    where: { id: { in: derivadas.map((o) => o.id) } },
    data: {
      canceladaEm: ctx.agora,
      motivoCancelamento: 'pagamento_invalidado',
      ataNumero: ataNumero ?? null,
    },
  })
  await registrarEvento(tx, ctx, {
    acao: 'obrigacao.cancelar',
    entidade: 'pagamento',
    entidadeId: pagamentoId,
    dados: { depois: { canceladas: derivadas.map((o) => o.id) } },
  })
  for (const o of derivadas) {
    for (const q of o.pagamentos) {
      // ponytail: cadeia de repasses é curta (uma por cessão); a recursão é sequencial porque a
      // DEVOLUCAO de q só nasce depois que as derivadas de q foram canceladas (obrigacao_por_pagamento)
      // eslint-disable-next-line no-await-in-loop
      await aoInvalidar(tx, ctx, q.id, ataNumero)
      // eslint-disable-next-line no-await-in-loop
      await criarDerivada(tx, ctx, {
        tipo: 'DEVOLUCAO',
        rodadaId: o.rodadaId,
        devedorId: q.recebedorId,
        credorId: o.devedorId,
        valorCentavos: q.valorCentavos,
        pagamentoOrigemId: q.id,
        ataNumero,
      })
    }
  }
}
