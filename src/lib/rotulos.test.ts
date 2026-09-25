import { describe, expect, it } from 'vitest'

import {
  MotivoContestacao,
  MotivoSemContemplado,
  StatusCessao,
  StatusCiclo,
  StatusPagamento,
  StatusRodada,
  StatusVotacao,
  TipoContemplacao,
  TipoObrigacao,
} from '@/generated/prisma/enums'

import {
  MOTIVO_CONTESTACAO,
  MOTIVO_SEM_CONTEMPLADO,
  STATUS_CESSAO,
  STATUS_CICLO,
  STATUS_PAGAMENTO,
  STATUS_RODADA,
  STATUS_VOTACAO,
  TIPO_CONTEMPLACAO,
  TIPO_OBRIGACAO,
} from './rotulos'

// 12 UI-17: nenhum valor de enum exibido sem rótulo.
describe('rótulos', () => {
  it.each([
    [StatusRodada, STATUS_RODADA],
    [StatusCiclo, STATUS_CICLO],
    [TipoContemplacao, TIPO_CONTEMPLACAO],
    [MotivoSemContemplado, MOTIVO_SEM_CONTEMPLADO],
    [StatusPagamento, STATUS_PAGAMENTO],
    [MotivoContestacao, MOTIVO_CONTESTACAO],
    [TipoObrigacao, TIPO_OBRIGACAO],
    [StatusVotacao, STATUS_VOTACAO],
    [StatusCessao, STATUS_CESSAO],
  ] as const)('cobre todos os valores (%#)', (enumerado, dicionario) => {
    expect(Object.keys(dicionario).sort()).toEqual(Object.values(enumerado).sort())
  })
})
