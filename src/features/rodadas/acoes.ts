'use server'

import { z } from 'zod'

import { acao } from '@/server/acao'

import { responderProximoCiclo } from './janela'
import { justificativaSchema, rodadaSchema } from './schemas'
import {
  declararNaoConcorrer,
  executarRodada,
  justificarAntecipadamente,
  revogarNaoConcorrer,
} from './servico'

// RN-SOR-02: reserva do tick — qualquer membro, só depois do horário.
export const realizarSorteioAcao = acao(rodadaSchema, (e, ctx) =>
  executarRodada(e.rodadaId, ctx.ator.pessoaId),
)

export const naoConcorrerAcao = acao(rodadaSchema, (e, ctx) => declararNaoConcorrer(ctx, e))

export const voltarAConcorrerAcao = acao(rodadaSchema, (e, ctx) => revogarNaoConcorrer(ctx, e))

export const justificarAntecipadamenteAcao = acao(justificativaSchema, (e, ctx) =>
  justificarAntecipadamente(ctx, e),
)

// RN-CIC-05 (art. 44): confirmar ou recusar o próximo ciclo na janela de revisão.
export const responderProximoCicloAcao = acao(
  z.object({ cicloId: z.uuid(), resposta: z.enum(['confirmo', 'recuso']) }),
  (e, ctx) =>
    responderProximoCiclo(ctx, { cicloId: e.cicloId, confirma: e.resposta === 'confirmo' }),
)
