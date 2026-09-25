// RN-ACE-10: CLI do operador. Uso:
//   pnpm cli bootstrap ./bootstrap.json
//   pnpm cli corrigir-bootstrap ./bootstrap.json
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { bootstrapSchema } from '@/features/bootstrap/schema'
import { corrigirBootstrap, executarBootstrap } from '@/features/bootstrap/servico'
import { db } from '@/server/db'
import { agora } from '@/server/relogio'

async function main() {
  const [comando, caminho] = process.argv.slice(2)
  if (!comando || !caminho || !['bootstrap', 'corrigir-bootstrap'].includes(comando)) {
    console.error('Uso: pnpm cli <bootstrap|corrigir-bootstrap> <arquivo.json>')
    process.exit(2)
  }
  const bruto = readFileSync(caminho, 'utf8')
  const lido = bootstrapSchema.safeParse(JSON.parse(bruto))
  if (!lido.success) {
    console.error(lido.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n'))
    process.exit(1)
  }
  const texto = readFileSync(resolve(dirname(caminho), lido.data.regulamento), 'utf8')

  if (comando === 'bootstrap') {
    const r = await executarBootstrap(lido.data, texto, bruto, agora())
    console.log(
      `Bootstrap concluído.\nsha256 da versão 1.0: ${r.sha256Versao}\nsha256 do arquivo:    ${r.sha256Arquivo}`,
    )
    console.log('Divulgue os dois hashes no GRUPO.')
  } else {
    const r = await corrigirBootstrap(lido.data, texto, agora())
    console.log(
      r.alteracoes.length ? `Correções:\n- ${r.alteracoes.join('\n- ')}` : 'Nada a corrigir.',
    )
    console.log(`sha256 da versão 1.0: ${r.sha256Versao}`)
  }
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => void db.$disconnect())
