// 05 §5: dados fictícios de desenvolvimento. Aborta em produção ou com a base não vazia
// (mesma trava do bootstrap). O onboarding é feito pela UI com o login dev.
import { FUNDADORES_DEV, semearDev } from '@/features/bootstrap/dev'
import { db } from '@/server/db'
import { agora } from '@/server/relogio'

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('seed-dev é proibido em produção')
  const r = await semearDev(agora())
  console.log(`Seed ok (sha256 1.0 ${r.sha256Versao.slice(0, 12)}…). Entre em:`)
  for (const f of FUNDADORES_DEV) {
    console.log(`  ${f.apelido.padEnd(6)} http://localhost:3100/api/auth/dev?steamId64=${f.steam}`)
  }
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => void db.$disconnect())
