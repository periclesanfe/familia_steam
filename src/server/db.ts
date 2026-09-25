import 'server-only'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

// Pool pequeno e com limites (13 DP-09). O pool só conecta na 1ª query, então o módulo pode ser
// avaliado no build sem banco. O env é validado no boot (instrumentation).
const criarCliente = () => {
  const cliente = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5_000, // o padrão (0) espera para sempre por uma conexão
      statement_timeout: 10_000,
      idle_in_transaction_session_timeout: 15_000, // transação esquecida não segura lock
    }),
    omit: { anexo: { conteudo: true } }, // bytes só quando pedidos explicitamente (DP-04)
    log: [{ emit: 'event', level: 'query' }],
  })
  // $on precisa ser registrado antes de qualquer $extends (DP-16)
  if (process.env.DEBUG_SQL === '1') {
    cliente.$on('query', (e) => {
      console.log(`[sql ${String(e.duration)}ms] ${e.query}`)
    })
  }
  return cliente
}

const globalComPrisma = globalThis as unknown as { prisma?: ReturnType<typeof criarCliente> }

export const db = globalComPrisma.prisma ?? criarCliente()

if (process.env.NODE_ENV !== 'production') globalComPrisma.prisma = db

/** Cliente de transação interativa, com o mesmo `omit` global do db. */
export type Tx = Omit<typeof db, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>
