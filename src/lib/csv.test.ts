import { describe, expect, it } from 'vitest'

import { celula, paraCsv } from './csv'

describe('CSV (RN-ACE-12, SEG-04)', () => {
  it('CA-172: fórmula vira texto', () => {
    expect(celula('=HYPERLINK("http://x","clique")')).toBe(`"'=HYPERLINK(""http://x"",""clique"")"`)
    expect(celula('+55 11 9999')).toBe("'+55 11 9999")
    expect(celula('-3')).toBe("'-3")
    expect(celula('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('números, datas, nulos e aspas', () => {
    expect(celula(2500)).toBe('2500')
    expect(celula(new Date('2026-10-03T15:00:00Z'))).toBe('2026-10-03T15:00:00.000Z')
    expect(celula(null)).toBe('')
    expect(celula('Ana "A"')).toBe('"Ana ""A"""')
    expect(paraCsv([{ a: 1, b: 'x,y' }])).toBe('a,b\r\n1,"x,y"')
    expect(paraCsv([])).toBe('')
  })
})
