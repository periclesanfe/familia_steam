import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'
import { db } from '@/server/db'

/** Conexão como dono (app_owner): só para limpar e preparar cenários. O código testado usa `db` (app_rw). */
export const dono = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 2 }),
})

/** Esvazia tudo menos `controle` e `_prisma_migrations`. TRUNCATE não dispara triggers de linha. */
export async function limpar(): Promise<void> {
  const tabelas = await dono.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'controle')`
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(', ')
  await dono.$executeRawUnsafe(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`)
}

/** 13 DP-16: número de consultas que `fn` dispara pelo `db` do app (sem BEGIN/COMMIT). */
export async function contarConsultas(fn: () => Promise<unknown>): Promise<number> {
  let total = 0
  const ouvir = (e: { query: string }) => {
    if (!/^(BEGIN|COMMIT|ROLLBACK)\b/i.test(e.query.trim())) total++
  }
  ouvintes.add(ouvir)
  try {
    await fn()
  } finally {
    ouvintes.delete(ouvir)
  }
  return total
}

const ouvintes = new Set<(e: { query: string }) => void>()
db.$on('query', (e) => {
  for (const o of ouvintes) o(e)
})

export const criarPessoa = (apelido = 'Ana', steamId64 = '76561197960287930') =>
  dono.pessoa.create({ data: { apelido, nome: apelido, steamId64 } })
