'use server'

import { acao } from '@/server/acao'

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
