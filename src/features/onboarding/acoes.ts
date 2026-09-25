'use server'

import { acao } from '@/server/acao'

import { assinaturaSchema, dadosCadastroSchema } from './schemas'
import { assinarRegulamento, salvarDados } from './servico'

// RN-ACE-06: onboarding é do PENDENTE; o MEMBRO troca a chave Pix pelo /perfil (RN-CAD-05).
export const salvarDadosAcao = acao(dadosCadastroSchema, (e, ctx) => salvarDados(ctx, e), {
  perfis: ['PENDENTE', 'MEMBRO'],
})

export const assinarAcao = acao(assinaturaSchema, (_, ctx) => assinarRegulamento(ctx), {
  perfis: ['PENDENTE'],
})
