import 'server-only'

import { randomBytes } from 'node:crypto'

import { somarHoras } from '@/domain/tempo'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'
import { familiaAtual } from '@/server/familia'

const DIAS_CONVITE = 14

/** RN-FAM-06: convite amarrado à conta Steam do candidato, de uso único. */
export async function criarConvite(tx: Tx, ctx: Contexto, indicacaoId: string, steamId64: string) {
  const familiaId = familiaAtual()
  if (!familiaId) throw new Error('convite fora de uma família')
  const c = await tx.convite.create({
    data: {
      familiaId,
      indicacaoId,
      steamId64,
      token: randomBytes(24).toString('base64url'),
      criadoEm: ctx.agora,
      expiraEm: somarHoras(ctx.agora, DIAS_CONVITE * 24),
    },
    select: { id: true },
  })
  await registrarEvento(tx, ctx, { acao: 'convite.criar', entidade: 'convite', entidadeId: c.id })
}

/**
 * Depois da vigência (efeito ADMISSAO_MEMBRO aprovado): a indicação ligada à votação vira
 * convite. Devolve false quando a votação não veio de uma indicação.
 */
export async function aprovarIndicacaoDaVotacao(
  tx: Tx,
  ctx: Contexto,
  votacaoId: string,
): Promise<boolean> {
  const i = await tx.indicacao.findUnique({ where: { votacaoId } })
  if (i?.status !== 'ABERTA') return false
  await tx.indicacao.update({
    where: { id: i.id },
    data: { status: 'APROVADA', encerradaEm: ctx.agora },
  })
  await criarConvite(tx, ctx, i.id, i.candidatoSteamId64)
  return true
}
