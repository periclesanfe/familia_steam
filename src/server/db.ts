import 'server-only'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

import { familiaAtual } from './familia'

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

/**
 * Cliente sem contexto de família: só para transações (`emTransacao` define a família nelas) e
 * para tabelas globais (sessão, Steam). Consultas do consórcio usam `db`.
 */
export const dbBase = globalComPrisma.prisma ?? criarCliente()

if (process.env.NODE_ENV !== 'production') globalComPrisma.prisma = dbBase

/**
 * 15 §4: cada consulta avulsa roda num lote `[set_config, consulta]`, para o RLS enxergar só a
 * família do contexto. Sem família, as tabelas do consórcio aparecem vazias.
 * ponytail: 1 ida extra ao banco por consulta; com 5 usuários não pesa.
 */
const comRls = dbBase.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const familiaId = familiaAtual()
        if (!familiaId) return query(args)
        const [, resultado] = await dbBase.$transaction([
          dbBase.$executeRaw`SELECT set_config('app.familia_id', ${familiaId}, true)`,
          query(args),
        ])
        return resultado
      },
    },
  },
})

/** Consultas avulsas (páginas, rotas). Transação: sempre `emTransacao` (`src/server/tx.ts`). */
export const db = comRls as Omit<typeof comRls, '$transaction'>

/** Cliente de transação interativa, com o mesmo `omit` global do db. */
export type Tx = Omit<
  typeof dbBase,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>
