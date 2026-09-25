import { describe, expect, it } from 'vitest'

import {
  dataLocal,
  deDb,
  fimDoDia,
  formatarDuracao,
  inicioDoMesSeguinte,
  instanteDeCampoLocal,
  mesDe,
  primeiroDiaApos,
  instanteLocal,
  paraDb,
  prazoConfirmacao,
  prazoEmDias,
  somarAnos,
  somarDiasAoInstante,
} from './tempo'

const iso = (d: Date) => d.toISOString()

describe('tempo', () => {
  it('CA-01: sorteio em 03/10/2026 12:00 → vencimentos e prazo de compra', () => {
    const sorteio = instanteLocal('2026-10-03', '12:00')
    expect(iso(sorteio)).toBe('2026-10-03T15:00:00.000Z')
    const vencimento = fimDoDia(dataLocal(sorteio))
    expect(iso(vencimento)).toBe('2026-10-04T03:00:00.000Z') // 04/10 00:00 SP
    expect(iso(somarDiasAoInstante(vencimento, 7))).toBe('2026-10-11T03:00:00.000Z')
    expect(iso(prazoEmDias('2026-10-03', 30))).toBe('2026-11-03T03:00:00.000Z') // fim de 02/11
  })

  it('CA-02: prazo de 30 dias atravessando meses curtos e ano bissexto', () => {
    expect(iso(prazoEmDias('2026-11-03', 30))).toBe(iso(fimDoDia('2026-12-03')))
    expect(iso(prazoEmDias('2027-02-03', 30))).toBe(iso(fimDoDia('2027-03-05')))
    expect(iso(prazoEmDias('2028-02-03', 30))).toBe(iso(fimDoDia('2028-03-04')))
  })

  it('CA-03: Pix às 22:30 SP do dia 3 (01:30 UTC do dia 4) está no prazo', () => {
    const pix = new Date('2026-10-04T01:30:00Z')
    expect(dataLocal(pix)).toBe('2026-10-03')
    expect(pix < fimDoDia('2026-10-03')).toBe(true)
  })

  it('CA-146: vencimento 04/10 00:00 justificado vai a 11/10 00:00, não 12/10', () => {
    const vencimento = instanteLocal('2026-10-04')
    expect(iso(somarDiasAoInstante(vencimento, 7))).toBe(iso(instanteLocal('2026-10-11')))
  })

  it('CA-147: saída em 28/02 às 22:00 SP grava a data 28/02', () => {
    const saida = new Date('2027-03-01T01:00:00Z')
    expect(deDb(paraDb(dataLocal(saida)))).toBe('2027-02-28')
  })

  it('horário de verão: meia-noite inexistente vira o primeiro instante do dia', () => {
    // 04/11/2018: o Brasil adiantou de 00:00 para 01:00
    expect(iso(instanteLocal('2018-11-04'))).toBe('2018-11-04T03:00:00.000Z')
    expect(dataLocal(instanteLocal('2018-11-04'))).toBe('2018-11-04')
    // 17/02/2019: 00:00 voltou para 23:00 do dia 16; meia-noite do dia 17 existe uma vez
    expect(iso(instanteLocal('2019-02-17'))).toBe('2019-02-17T03:00:00.000Z')
    expect(iso(instanteLocal('2019-02-16', '23:30'))).toBe('2019-02-17T01:30:00.000Z')
  })

  it('somarAnos: 29/02 vira 28/02', () => {
    expect(somarAnos('2028-02-29', 1)).toBe('2029-02-28')
    expect(somarAnos('2026-10-03', 1)).toBe('2027-10-03')
  })

  it('inicioDoMesSeguinte e prazoConfirmacao (RN-REG-03, RN-CIC-05)', () => {
    expect(iso(inicioDoMesSeguinte(new Date('2026-10-01T01:59:00Z')))).toBe(
      iso(instanteLocal('2026-10-01')),
    ) // 30/09 22:59 SP
    expect(iso(inicioDoMesSeguinte(new Date('2026-12-15T12:00:00Z')))).toBe(
      iso(instanteLocal('2027-01-01')),
    )
    expect(iso(prazoConfirmacao('2027-10-03'))).toBe(iso(fimDoDia('2027-10-02')))
  })

  it('rejeita datas inválidas', () => {
    expect(() => paraDb('2026-02-30')).toThrow(RangeError)
    expect(() => instanteLocal('2026-10-03', '24:61')).toThrow(RangeError)
  })

  it('formatarDuracao', () => {
    expect(formatarDuracao(-5)).toBe('0 s')
    expect(formatarDuracao(45_000)).toBe('45 s')
    expect(formatarDuracao(3 * 3_600_000 + 12 * 60_000)).toBe('3 h 12 min')
    expect(formatarDuracao(2 * 86_400_000 + 3 * 3_600_000)).toBe('2 d 3 h')
  })

  it('primeiroDiaApos: estritamente depois (RN-CIC-01)', () => {
    expect(primeiroDiaApos('2026-10-02', 3)).toBe('2026-10-03')
    expect(primeiroDiaApos('2026-10-03', 3)).toBe('2026-11-03')
    expect(primeiroDiaApos('2026-12-15', 3)).toBe('2027-01-03')
    expect(mesDe('2026-10-03')).toBe('2026-10')
  })

  it('instanteDeCampoLocal lê datetime-local no fuso de SP, não no do navegador', () => {
    expect(instanteDeCampoLocal('2026-10-03T22:30')?.toISOString()).toBe('2026-10-04T01:30:00.000Z')
    expect(instanteDeCampoLocal('2026-02-30T10:00')).toBeNull()
    expect(instanteDeCampoLocal('ontem')).toBeNull()
  })
})
