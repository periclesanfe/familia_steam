import 'server-only'

import { mascararPix } from '@/domain/mascara'
import type { AtorTipo } from '@/generated/prisma/enums'

import type { Tx } from './db'

export type Ator = { tipo: 'MEMBRO'; pessoaId: string } | { tipo: Exclude<AtorTipo, 'MEMBRO'> }
export type Contexto = { ator: Ator; agora: Date }

const DESCARTAR = new Set(['conteudo', 'tokenHash'])

/** RN-GER-04: mascara `chavePix*`, descarta bytes e hashes de token, e serializa datas. */
export function sanitizar(v: unknown, chave = ''): unknown {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Uint8Array) return undefined
  if (typeof v === 'string') return chave.startsWith('chavePix') ? mascararPix(v) : v
  if (Array.isArray(v)) return v.map((x) => sanitizar(x, chave))
  if (typeof v === 'object') {
    const saida: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) {
      if (DESCARTAR.has(k)) continue
      const limpo = sanitizar(x, k)
      if (limpo !== undefined) saida[k] = limpo
    }
    return saida
  }
  return v
}

type Evento = {
  acao: string
  entidade: string
  entidadeId: string
  dados?: { antes?: unknown; depois?: unknown; motivo?: string }
  ataNumero?: number
}

/** Grava o evento na MESMA transação da mutação (RN-GER-04): falhou aqui, a mutação não acontece. */
export async function registrarEvento(tx: Tx, ctx: Contexto, e: Evento): Promise<void> {
  await tx.eventoAuditoria.create({
    data: {
      ocorridoEm: ctx.agora,
      atorTipo: ctx.ator.tipo,
      atorPessoaId: ctx.ator.tipo === 'MEMBRO' ? ctx.ator.pessoaId : null,
      acao: e.acao,
      entidade: e.entidade,
      entidadeId: e.entidadeId,
      dados: sanitizar(e.dados ?? {}) as object,
      ataNumero: e.ataNumero ?? null,
    },
  })
}
