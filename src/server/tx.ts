import 'server-only'

import { ErroDeNegocio } from '@/domain/erros'
import { Prisma } from '@/generated/prisma/client'

import { db, type Tx } from './db'

/** Uma mutação = uma transação curta, só com banco (13 DP-08). Estouro de tempo vira OCUPADO. */
export async function emTransacao<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await db.$transaction(fn)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2028') {
      throw new ErroDeNegocio('OCUPADO')
    }
    throw e
  }
}

const locksDaTransacao = new WeakMap<Tx, string[]>()

/**
 * RN-GER-06: advisory lock da transação. 'fechamento' é sempre o primeiro lock (ordem fixa
 * evita deadlock); pedir 'fechamento' depois de outro lock é erro de programação.
 */
export async function travar(tx: Tx, chave: string): Promise<void> {
  const ja = locksDaTransacao.get(tx) ?? []
  if (chave === 'fechamento' && ja.length > 0 && !ja.includes('fechamento')) {
    throw new Error(`lock 'fechamento' pedido depois de ${ja.join(', ')} (RN-GER-06)`)
  }
  if (ja.includes(chave)) return
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`
  locksDaTransacao.set(tx, [...ja, chave])
}
