import { describe, expect, it } from 'vitest'

import { formatarBRL } from './dinheiro'

describe('formatarBRL', () => {
  it('formata centavos em reais (pt-BR)', () => {
    expect(formatarBRL(2500)).toBe('R$ 25,00')
    expect(formatarBRL(123456)).toBe('R$ 1.234,56')
  })

  it('recusa valores não inteiros', () => {
    expect(() => formatarBRL(25.5)).toThrow(RangeError)
  })
})
