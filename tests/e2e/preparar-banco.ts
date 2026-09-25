// Roda com tsx --conditions=react-server (globalSetup do Playwright): banco *_teste zerado + seed.
import { semearDev } from '@/features/bootstrap/dev'
import { db } from '@/server/db'

import recriarBancoDeTeste from '../integracao/setup-global'

async function main() {
  await recriarBancoDeTeste()
  await semearDev(new Date())
}

main()
  .catch((e: unknown) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => void db.$disconnect())
