// C-HASH (docs/spec/02 §0): JSON canônico e sha256 de versões, snapshots e ATAs.
import { createHash } from 'node:crypto'

type Json = null | boolean | number | string | Json[] | { [k: string]: Json | undefined }

/** Ordem por code point (não por unidade UTF-16, que é o padrão do sort do JS). */
function compararCodePoint(a: string, b: string): number {
  const [x, y] = [Array.from(a), Array.from(b)] // code points, de propósito (C-HASH)
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i]?.codePointAt(0) ?? 0) - (y[i]?.codePointAt(0) ?? 0)
    if (d !== 0) return d
  }
  return x.length - y.length
}

export function jsonCanonico(v: Json): string {
  if (typeof v === 'number' && !Number.isFinite(v)) throw new RangeError('número não finito')
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(',')}]`
  const pares = Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort(compararCodePoint)
    .map((k) => `${JSON.stringify(k)}:${jsonCanonico(v[k] as Json)}`)
  return `{${pares.join(',')}}`
}

export const sha256hex = (texto: string): string =>
  createHash('sha256').update(texto, 'utf8').digest('hex')

/** Texto com LF e sem BOM (C-HASH). */
export const normalizarTexto = (texto: string): string =>
  texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n')

export const hashVersao = (texto: string, parametros: Json): string =>
  sha256hex(`${normalizarTexto(texto)}\n${jsonCanonico(parametros)}`)

export const hashSnapshot = (snapshot: Json): string => sha256hex(jsonCanonico(snapshot))

export type { Json }
