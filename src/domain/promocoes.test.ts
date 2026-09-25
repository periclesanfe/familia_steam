import { describe, expect, it } from 'vitest'

import { cruzarJanelas, sorteiosPrevistos } from './promocoes'

describe('calendário de promoções (15 §6)', () => {
  it('projeta os sorteios do dia 3, virando o ano', () => {
    expect(sorteiosPrevistos('2026-11-10', 3, 3)).toEqual([
      '2026-12-03',
      '2027-01-03',
      '2027-02-03',
    ])
    expect(sorteiosPrevistos('2026-11-02', 3, 1)).toEqual(['2026-11-03'])
  })

  it('a janela de compra de 30 dias pega a promoção; marca a que já está no dia do sorteio', () => {
    const inverno = { id: 'i', nome: 'Inverno', inicio: '2026-12-17', fim: '2027-01-05' }
    const [dez, jan, fev] = cruzarJanelas(['2026-12-03', '2027-01-03', '2027-02-03'], 30, [inverno])
    expect(dez?.eventos).toEqual([{ ...inverno, noDia: false }]) // compra até 02/01
    expect(jan?.eventos).toEqual([{ ...inverno, noDia: true }])
    expect(fev?.eventos).toEqual([])
    expect(dez?.fimCompra).toBe('2027-01-02')
  })
})
