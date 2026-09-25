// 05 §5: dados fictícios de desenvolvimento. Aborta em produção ou com a base não vazia
// (mesma trava do bootstrap). Ninguém assinou: o onboarding é feito pela UI com o login dev.
import { readFileSync } from 'node:fs'

import { bootstrapSchema } from '@/features/bootstrap/schema'
import { executarBootstrap } from '@/features/bootstrap/servico'
import { db } from '@/server/db'
import { agora } from '@/server/relogio'

export const FUNDADORES_DEV = [
  { nome: 'Ana Souza', apelido: 'Ana', steam: '76561197960287930' },
  { nome: 'Bruno Lima', apelido: 'Bruno', steam: '76561197960287931' },
  { nome: 'Caio Rocha', apelido: 'Caio', steam: '76561197960287932' },
  { nome: 'Duda Alves', apelido: 'Duda', steam: '76561197960287933' },
  { nome: 'Edu Martins', apelido: 'Edu', steam: '76561197960287934' },
]

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('seed-dev é proibido em produção')
  const b = bootstrapSchema.parse({
    regulamento: 'docs/regulamento/regulamento-v1.0.md',
    fundadores: FUNDADORES_DEV.map((f) => ({ ...f, entrouNaFamiliaEm: '2025-01-10' })),
    integrantes: [{ apelido: 'Kiko (conta infantil)', entrouNaFamiliaEm: '2025-06-01' }],
  })
  const texto = readFileSync(b.regulamento, 'utf8')
  const r = await executarBootstrap(b, texto, JSON.stringify(b), agora())
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
