'use server'

import { z } from 'zod'

import { acao } from '@/server/acao'

import { registrarExecucao } from './servico'

// RN-CAD-08/09: qualquer membro registra a execução na Steam do que a ATA autorizou.
export const registrarExecucaoAcao = acao(
  z.object({ integranteId: z.uuid(), executadaEm: z.iso.date('Informe a data') }),
  (e, ctx) => registrarExecucao(ctx, e),
)
