import { describe, expect, it } from 'vitest'

import {
  MotivoSemContemplado,
  StatusCiclo,
  StatusRodada,
  TipoContemplacao,
} from '@/generated/prisma/enums'

import { MOTIVO_SEM_CONTEMPLADO, STATUS_CICLO, STATUS_RODADA, TIPO_CONTEMPLACAO } from './rotulos'

// 12 UI-17: nenhum valor de enum exibido sem rótulo.
describe('rótulos', () => {
  it.each([
    [StatusRodada, STATUS_RODADA],
    [StatusCiclo, STATUS_CICLO],
    [TipoContemplacao, TIPO_CONTEMPLACAO],
    [MotivoSemContemplado, MOTIVO_SEM_CONTEMPLADO],
  ] as const)('cobre todos os valores (%#)', (enumerado, dicionario) => {
    expect(Object.keys(dicionario).sort()).toEqual(Object.values(enumerado).sort())
  })
})
