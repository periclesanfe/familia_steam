'use server'

import { redirect } from 'next/navigation'

import { acao } from '@/server/acao'

import { convocarSchema, votacaoSchema, votarSchema } from './schemas'
import { cancelarVotacao, convocar, votar } from './servico'

// RN-VOT-01: qualquer membro ATIVO ou IMPOSSIBILITADO (perfil MEMBRO).
export const convocarAcao = acao(convocarSchema, async (e, ctx) => {
  const { votacaoId } = await convocar(ctx, e)
  redirect(`/votacoes/${votacaoId}`)
})

export const votarAcao = acao(votarSchema, (e, ctx) => votar(ctx, e))

export const cancelarVotacaoAcao = acao(votacaoSchema, (e, ctx) => cancelarVotacao(ctx, e))
