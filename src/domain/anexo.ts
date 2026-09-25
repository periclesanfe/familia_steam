// RN-ACE-09: o tipo do arquivo vem dos magic bytes, nunca do que o cliente informa.

export const LIMITE_ANEXO_BYTES = 5 * 1024 * 1024

export type MimeAceito = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

const comeca = (b: Uint8Array, assinatura: readonly number[], deslocamento = 0) =>
  assinatura.every((x, i) => b[deslocamento + i] === x)

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))

/** Devolve o mime reconhecido ou null (HEIC, SVG, HTML, texto… são recusados). */
export function detectarMime(b: Uint8Array): MimeAceito | null {
  if (comeca(b, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (comeca(b, ascii('RIFF')) && comeca(b, ascii('WEBP'), 8)) return 'image/webp'
  if (comeca(b, ascii('%PDF-'))) return 'application/pdf'
  return null
}

export type ResultadoArquivo =
  | { ok: true; mime: MimeAceito }
  | { ok: false; motivo: 'VAZIO' | 'GRANDE_DEMAIS' | 'TIPO_NAO_ACEITO' }

export function validarArquivo(b: Uint8Array): ResultadoArquivo {
  if (b.length === 0) return { ok: false, motivo: 'VAZIO' }
  if (b.length > LIMITE_ANEXO_BYTES) return { ok: false, motivo: 'GRANDE_DEMAIS' }
  const mime = detectarMime(b)
  return mime ? { ok: true, mime } : { ok: false, motivo: 'TIPO_NAO_ACEITO' }
}

/** Gravação de chamada entra só como link https (RN-ACE-09). */
export function linkExternoValido(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
