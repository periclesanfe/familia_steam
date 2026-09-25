'use server'

import { z } from 'zod'

import { acao } from '@/server/acao'

import { adicionarEvento, removerEvento } from './servico'

const dataCivil = z.iso.date('Informe a data')

// 15 §6: quem está numa família cadastra; o link da fonte é obrigatório (sem datas inventadas).
export const adicionarEventoAcao = acao(
  z.object({
    nome: z.string().trim().min(3, 'Dê um nome ao evento').max(80),
    inicio: dataCivil,
    fim: dataCivil,
    fonteUrl: z.url({ protocol: /^https$/, error: 'Link https da fonte' }).max(500),
  }),
  (e, ctx) => adicionarEvento(ctx, e),
  { perfis: ['MEMBRO', 'PENDENTE'] },
)

export const removerEventoAcao = acao(
  z.object({ eventoId: z.uuid() }),
  (e, ctx) => removerEvento(ctx, e),
  { perfis: ['MEMBRO', 'PENDENTE'] },
)
