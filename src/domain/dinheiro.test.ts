import { describe, expect, it } from 'vitest'

import { centavosDeTexto, formatarBRL } from './dinheiro'

describe('formatarBRL', () => {
  it('formata centavos em reais (pt-BR)', () => {
    expect(formatarBRL(2500)).toBe('R$ 25,00')
    expect(formatarBRL(123456)).toBe('R$ 1.234,56')
  })

  it('recusa valores não inteiros', () => {
    expect(() => formatarBRL(25.5)).toThrow(RangeError)
  })
})

describe('centavosDeTexto (12 UI-07)', () => {
  it('aceita os formatos brasileiros', () => {
    expect(['25', '25,5', '25,50', '1.234,56', 'R$ 10', ' 0,99 '].map(centavosDeTexto)).toEqual([
      2500, 2550, 2550, 123456, 1000, 99,
    ])
  })

  it('recusa o que não é valor', () => {
    expect(['', '-5', '1,234', '12.34', '1.23,00', 'abc', '10,'].map(centavosDeTexto)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ])
  })
})
