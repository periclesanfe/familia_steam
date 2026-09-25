import { execFileSync } from 'node:child_process'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

const URL_TESTE =
  process.env.TEST_MIGRATE_DATABASE_URL ??
  'postgresql://app_owner:app_owner@localhost:5433/consorcio_teste'

// 08 §6: schema recriado uma vez por execução; os arquivos rodam em série e limpam no beforeEach.
export default async function setup() {
  const banco = new URL(URL_TESTE).pathname.slice(1)
  if (!banco.endsWith('_teste')) {
    throw new Error(`Recusado: os testes só recriam bancos *_teste (recebido: ${banco})`)
  }
  const dono = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_TESTE, max: 1 }) })
  try {
    await dono.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE')
    await dono.$executeRawUnsafe('CREATE SCHEMA public')
  } finally {
    await dono.$disconnect()
  }
  execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], {
    stdio: 'pipe',
    env: { ...process.env, MIGRATE_DATABASE_URL: URL_TESTE },
  })
}
