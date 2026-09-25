import { describe, expect, it } from 'vitest'

import { ehAcao } from '@/server/acao'

// CA-169 / 14 SEG-01: toda Server Action exportada é endpoint público e precisa passar por acao().
const modulos = import.meta.glob('/src/features/*/acoes.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>

describe('guarda das Server Actions', () => {
  it.each(Object.entries(modulos))('%s: toda exportação foi criada por acao()', (_, m) => {
    for (const [nome, valor] of Object.entries(m)) {
      expect(ehAcao(valor), `${nome} não passou por acao()`).toBe(true)
    }
  })
})
