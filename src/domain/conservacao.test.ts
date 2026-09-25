import { describe, expect, it } from 'vitest'

import { complementar, conservaRodada, gasto, pagosAte, ratear, sobra } from './financeiro'

/** PRNG determinístico (mulberry32): a falha se reproduz pela semente. */
function prng(semente: number) {
  let s = semente >>> 0
  return (max: number) => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) % max
  }
}

describe('CA-37: conservação sob sequências aleatórias (RN-FIN-18)', () => {
  it('fechamento + reembolsos posteriores em qualquer ordem mantêm a conservação da rodada', () => {
    for (let semente = 1; semente <= 500; semente++) {
      const r = prng(semente)
      const premioR = 2500 * (2 + r(5)) + r(4000) // contribuições + SOBRA recebida
      const aquisicoes = Array.from({ length: 1 + r(3) }, () => ({
        valorCentavos: 1 + r(premioR),
        reembolsoValorCentavos: null as number | null,
      }))
      const sobraR = sobra(premioR, gasto(aquisicoes)) // no fechamento
      let complementares = 0
      for (const k of Array.from({ length: r(4) }, () => r(aquisicoes.length))) {
        const a = aquisicoes[k]
        if (!a) continue
        const ja = a.reembolsoValorCentavos ?? 0
        a.reembolsoValorCentavos = ja + r(a.valorCentavos - ja + 1) // reembolso parcial ou total
        complementares += complementar({
          premioCentavos: premioR,
          gastoNovoCentavos: gasto(aquisicoes),
          sobraCentavos: sobraR,
          outrasComplementares: complementares,
        })
        expect(
          conservaRodada({
            premioCentavos: premioR,
            gastoCentavos: gasto(aquisicoes),
            sobraCentavos: sobraR,
            complementares,
          }),
          `semente ${String(semente)}`,
        ).toBe(true)
      }
    }
  })

  it('rateio nunca cria nem perde centavos; pagamentos parciais nunca passam do valor', () => {
    for (let semente = 1; semente <= 500; semente++) {
      const r = prng(semente)
      const total = r(100_000)
      const k = 1 + r(6)
      const cotas = ratear(
        total,
        Array.from({ length: k }, (_, i) => String(i)),
      )
      expect(cotas.reduce((s, c) => s + c.centavos, 0)).toBe(total)
      expect(
        Math.max(...cotas.map((c) => c.centavos)) - Math.min(...cotas.map((c) => c.centavos)),
      ).toBeLessThanOrEqual(1)

      const valor = 2500
      const pagamentos: {
        status: 'DECLARADO' | 'INVALIDADO'
        formaDiversa: boolean
        valorCentavos: number
      }[] = []
      for (let i = 0; i < r(6); i++) {
        const saldo = valor - pagosAte(pagamentos)
        if (saldo <= 0) break
        pagamentos.push({
          status: r(4) === 0 ? 'INVALIDADO' : 'DECLARADO',
          formaDiversa: false,
          valorCentavos: 1 + r(saldo),
        })
      }
      expect(pagosAte(pagamentos)).toBeLessThanOrEqual(valor)
    }
  })
})
