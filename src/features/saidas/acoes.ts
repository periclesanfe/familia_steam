'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { acao } from '@/server/acao'

import { declararImpossibilidade, sairDaFamilia, sairDoConsorcio } from './servico'

const confirmado = z.object({ entendi: z.literal('on', 'Marque que entendeu as consequências') })

// RN-SAI-01: vale também para quem aguarda o ciclo (PENDENTE).
export const sairDoConsorcioAcao = acao(
  confirmado,
  async (_, ctx): Promise<void> => {
    await sairDoConsorcio(ctx)
    redirect('/')
  },
  { perfis: ['MEMBRO', 'PENDENTE'] },
)

export const sairDaFamiliaAcao = acao(
  confirmado,
  async (_, ctx): Promise<void> => {
    await sairDaFamilia(ctx)
    redirect('/')
  },
  { perfis: ['MEMBRO', 'PENDENTE', 'EX_COM_PENDENCIA', 'EX_QUITADO'] },
)

export const declararImpossibilidadeAcao = acao(confirmado, (_, ctx) =>
  declararImpossibilidade(ctx),
)
