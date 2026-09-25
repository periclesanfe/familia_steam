'use server'

import { z } from 'zod'

import { acao } from '@/server/acao'

import { proporCessao, responderCessao, retirarCessao } from './servico'

// RN-CES-01/02: o cedente é o ator; a elegibilidade é revalidada no servidor.
export const proporCessaoAcao = acao(
  z.object({
    rodadaId: z.uuid(),
    beneficiarioId: z.uuid('Escolha o beneficiário'),
    cienciaPrazo: z.literal('on').optional(),
  }),
  (e, ctx) =>
    proporCessao(ctx, {
      rodadaId: e.rodadaId,
      beneficiarioId: e.beneficiarioId,
      cienciaPrazo: e.cienciaPrazo === 'on',
    }),
)

// RN-CES-03: aceite e recusa só pelo beneficiário, sem transcrição.
export const responderCessaoAcao = acao(
  z.object({ cessaoId: z.uuid(), resposta: z.enum(['aceitar', 'recusar']) }),
  (e, ctx) => responderCessao(ctx, { cessaoId: e.cessaoId, aceitar: e.resposta === 'aceitar' }),
)

export const retirarCessaoAcao = acao(z.object({ cessaoId: z.uuid() }), (e, ctx) =>
  retirarCessao(ctx, e),
)
