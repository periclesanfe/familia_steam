import { describe, expect, it } from 'vitest'

import { hashVersao, jsonCanonico, sha256hex } from './hash'

describe('hash (C-HASH)', () => {
  it('CA-148: mesmo texto e parâmetros com chaves em ordem diferente → mesmo sha256', () => {
    const a = hashVersao('# Regulamento\n', { b: 1, a: { d: [2, 1], c: 'x' } })
    const b = hashVersao('# Regulamento\n', { a: { c: 'x', d: [2, 1] }, b: 1 })
    expect(a).toBe(b)
  })

  it('CRLF e BOM não mudam o hash; conteúdo muda', () => {
    const base = hashVersao('linha 1\nlinha 2', {})
    expect(hashVersao('﻿linha 1\r\nlinha 2', {})).toBe(base)
    expect(hashVersao('linha 1\nlinha 3', {})).not.toBe(base)
  })

  it('JSON canônico: sem espaços, ordem por code point, undefined omitido', () => {
    expect(jsonCanonico({ b: [1, 'é'], a: null, z: undefined })).toBe('{"a":null,"b":[1,"é"]}')
    // U+1F600 (surrogate D83D) vem depois de U+FF5E por code point, antes por UTF-16
    expect(jsonCanonico({ '\u{1F600}': 1, '～': 2 })).toBe('{"～":2,"😀":1}')
    expect(() => jsonCanonico({ x: Number.NaN })).toThrow(RangeError)
  })

  it('sha256hex conhecido', () => {
    expect(sha256hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
