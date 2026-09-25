import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'
import type { StatusMembro } from '@/generated/prisma/enums'
import { dbBase } from '@/server/db'
import { FAMILIA_PADRAO } from '@/server/familia'

/** Conexão como dono (app_owner): só para limpar e preparar cenários. O código testado usa `db` (app_rw). */
export const dono = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.MIGRATE_DATABASE_URL,
    max: 2,
    // o dono não passa pelo RLS, mas o default de "familiaId" lê app.familia_id (15 §4)
    options: `-c app.familia_id=${FAMILIA_PADRAO}`,
  }),
})

/** Esvazia tudo menos `controle` e `_prisma_migrations`. TRUNCATE não dispara triggers de linha. */
export async function limpar(): Promise<void> {
  const tabelas = await dono.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'controle')`
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(', ')
  await dono.$executeRawUnsafe(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`)
  // controle guarda estado técnico (lease do tick, pausa da Steam): volta ao inicial
  await dono.controle.updateMany({ data: { ate: null, valor: undefined } })
}

/** 13 DP-16: número de consultas que `fn` dispara pelo `db` do app (sem BEGIN/COMMIT). */
export async function contarConsultas(fn: () => Promise<unknown>): Promise<number> {
  let total = 0
  const ouvir = (e: { query: string }) => {
    // BEGIN/COMMIT e o set_config do RLS (15 §4) não são consultas de negócio
    if (!/^(BEGIN|COMMIT|ROLLBACK)\b|set_config\('app\.familia_id'/i.test(e.query.trim())) total++
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
dbBase.$on('query', (e) => {
  for (const o of ouvintes) o(e)
})

export const criarPessoa = (apelido = 'Ana', steamId64 = '76561197960287930') =>
  dono.pessoa.create({ data: { apelido, nome: apelido, steamId64 } })

/** Pessoa com vínculo de membro no status pedido (fundador). */
export async function criarMembro(
  status: StatusMembro = 'ATIVO',
  apelido = 'Ana',
  steamId64 = '76561197960287930',
) {
  const pessoa = await dono.pessoa.update({
    where: { id: (await criarPessoa(apelido, steamId64)).id },
    data: { familiaId: FAMILIA_PADRAO }, // 15 RN-FAM-01: membro está numa família
  })
  const membro = await dono.membro.create({
    data: {
      pessoaId: pessoa.id,
      origem: 'FUNDADOR',
      status,
      ...(status === 'ENCERRADO'
        ? { encerradoEm: new Date(), motivoEncerramento: 'SAIDA_VOLUNTARIA' as const }
        : {}),
    },
  })
  return { pessoa, membro }
}
