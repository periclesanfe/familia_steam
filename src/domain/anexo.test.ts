import { describe, expect, it } from 'vitest'

import { detectarMime, LIMITE_ANEXO_BYTES, linkExternoValido, validarArquivo } from './anexo'

const bytes = (...partes: (number[] | string)[]) =>
  new Uint8Array(partes.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p)] : p)))

describe('anexos (RN-ACE-09)', () => {
  it('reconhece JPEG, PNG, WebP e PDF pelos magic bytes', () => {
    expect(detectarMime(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(detectarMime(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(detectarMime(bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 '))).toBe('image/webp')
    expect(detectarMime(bytes('%PDF-1.7'))).toBe('application/pdf')
  })

  it('CA-106: HEIC, SVG e PDF de 6 MB são recusados', () => {
    const heic = bytes([0, 0, 0, 0x18], 'ftypheic')
    const svg = bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    const pdfGrande = new Uint8Array(6 * 1024 * 1024)
    pdfGrande.set(bytes('%PDF-1.7'))
    expect(validarArquivo(heic)).toEqual({ ok: false, motivo: 'TIPO_NAO_ACEITO' })
    expect(validarArquivo(svg)).toEqual({ ok: false, motivo: 'TIPO_NAO_ACEITO' })
    expect(validarArquivo(pdfGrande)).toEqual({ ok: false, motivo: 'GRANDE_DEMAIS' })
    expect(validarArquivo(new Uint8Array())).toEqual({ ok: false, motivo: 'VAZIO' })
  })

  it('aceita exatamente 5 MB; o tipo informado pelo cliente não importa', () => {
    const limite = new Uint8Array(LIMITE_ANEXO_BYTES)
    limite.set([0xff, 0xd8, 0xff])
    expect(validarArquivo(limite)).toEqual({ ok: true, mime: 'image/jpeg' })
  })

  it('link externo só https', () => {
    expect(linkExternoValido('https://drive.exemplo.com/video')).toBe(true)
    expect(linkExternoValido('http://drive.exemplo.com/video')).toBe(false)
    expect(linkExternoValido('javascript:alert(1)')).toBe(false)
    expect(linkExternoValido('não é url')).toBe(false)
  })
})
