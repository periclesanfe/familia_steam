import { describe, expect, it } from 'vitest'

import { diffLinhas, trechosDoDiff } from './diff'

describe('diff do Regulamento (07 §3.7)', () => {
  it('marca linhas removidas e incluídas e preserva as iguais', () => {
    expect(diffLinhas('a\nb\nc', 'a\nx\nc')).toEqual([
      { tipo: 'igual', texto: 'a' },
      { tipo: 'removida', texto: 'b' },
      { tipo: 'incluida', texto: 'x' },
      { tipo: 'igual', texto: 'c' },
    ])
    expect(diffLinhas('a', 'a').every((l) => l.tipo === 'igual')).toBe(true)
  })

  it('omite as linhas iguais longe das mudanças', () => {
    const antes = Array.from({ length: 20 }, (_, i) => `l${String(i)}`).join('\n')
    const depois = antes.replace('l10', 'novo')
    const t = trechosDoDiff(diffLinhas(antes, depois), 1)
    expect(t[0]).toEqual({ tipo: 'omitidas', quantidade: 9 })
    expect(t.filter((l) => l.tipo !== 'omitidas')).toHaveLength(4)
    expect(t.at(-1)).toEqual({ tipo: 'omitidas', quantidade: 8 })
  })
})
