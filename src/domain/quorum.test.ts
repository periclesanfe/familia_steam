import { describe, expect, it } from 'vitest'

import { apurarVotacao, calcularQuorum, type VotoParaApurar } from './quorum'

const h = (hora: number) => new Date(Date.UTC(2026, 9, 5, hora))
const eleitores = ['a', 'b', 'c', 'd', 'e']
const votacao = {
  status: 'ABERTA' as const,
  encerraEm: h(20),
  eleitoresIds: eleitores,
  impedidosIds: [] as string[],
  quorum: 3,
}
const todos = new Set(eleitores)
const voto = (pessoaId: string, opcao: VotoParaApurar['opcao'], hora: number) => ({
  pessoaId,
  opcao,
  votadoEm: h(hora),
})

describe('quórum (RN-VOT-02/04)', () => {
  it('floor(n/2) + 1', () => {
    expect([5, 4, 3, 2, 6, 1].map(calcularQuorum)).toEqual([3, 3, 2, 2, 4, 1])
    expect(() => calcularQuorum(0)).toThrow(RangeError)
  })

  it('aprova no voto que completa o quórum', () => {
    const votos = [voto('a', 'FAVOR', 1), voto('b', 'FAVOR', 2), voto('c', 'FAVOR', 3)]
    expect(apurarVotacao(votacao, votos, h(4), todos)).toEqual({
      status: 'APROVADA',
      motivo: 'QUORUM_ATINGIDO',
      encerradaEm: h(3),
    })
  })

  it('abstenção nunca aprova; rejeita quando a aprovação fica impossível', () => {
    const votos = [voto('a', 'CONTRA', 1), voto('b', 'ABSTENCAO', 2), voto('c', 'CONTRA', 3)]
    expect(apurarVotacao(votacao, votos, h(3), todos)).toMatchObject({
      status: 'REJEITADA',
      motivo: 'APROVACAO_IMPOSSIVEL',
    })
  })

  it('impedido e ex-membro não contam como pendentes', () => {
    const votos = [voto('a', 'FAVOR', 1), voto('b', 'FAVOR', 2)]
    expect(apurarVotacao(votacao, votos, h(3), todos)).toEqual({ status: 'ABERTA' })
    const semCeD = new Set(['a', 'b', 'e'])
    const comImpedido = { ...votacao, impedidosIds: ['e'] }
    expect(apurarVotacao(comImpedido, votos, h(3), semCeD)).toMatchObject({
      status: 'REJEITADA',
      motivo: 'APROVACAO_IMPOSSIVEL',
    })
  })

  it('prazo vencido sem quórum → REJEITADA com encerradaEm = encerraEm', () => {
    expect(apurarVotacao(votacao, [voto('a', 'FAVOR', 1)], h(21), todos)).toEqual({
      status: 'REJEITADA',
      motivo: 'PRAZO',
      encerradaEm: h(20),
    })
  })
})
