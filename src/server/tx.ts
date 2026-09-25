import 'server-only'

import { ErroDeNegocio } from '@/domain/erros'
import { Prisma } from '@/generated/prisma/client'

import { dbBase, type Tx } from './db'
import { familiaAtual } from './familia'

/** Uma mutação = uma transação curta, só com banco (13 DP-08). Estouro de tempo vira OCUPADO. */
export async function emTransacao<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const familiaId = familiaAtual()
  try {
    return await dbBase.$transaction(async (tx) => {
      // 15 §4: o RLS da transação inteira vê só a família do contexto
      if (familiaId) await tx.$executeRaw`SELECT set_config('app.familia_id', ${familiaId}, true)`
      return fn(tx)
    })
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
  // os locks coletivos são por família (15 §3); os de objeto já têm o id no nome
  const chaveNoBanco = ['fechamento', 'ata', 'regulamento'].includes(chave)
    ? `${chave}:${familiaAtual() ?? '-'}`
    : chave
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chaveNoBanco}, 0))`
  locksDaTransacao.set(tx, [...ja, chave])
}
