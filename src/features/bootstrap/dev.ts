import 'server-only'

import { readFileSync } from 'node:fs'

import { bootstrapSchema } from './schema'
import { executarBootstrap } from './servico'

// 05 §5: dados fictícios (seed de dev e E2E). Ninguém assinou.
export const FUNDADORES_DEV = [
  { nome: 'Ana Souza', apelido: 'Ana', steam: '76561197960287930' },
  { nome: 'Bruno Lima', apelido: 'Bruno', steam: '76561197960287931' },
  { nome: 'Caio Rocha', apelido: 'Caio', steam: '76561197960287932' },
  { nome: 'Duda Alves', apelido: 'Duda', steam: '76561197960287933' },
  { nome: 'Edu Martins', apelido: 'Edu', steam: '76561197960287934' },
]

export async function semearDev(agora: Date) {
  const b = bootstrapSchema.parse({
    regulamento: 'docs/regulamento/regulamento-v1.0.md',
    fundadores: FUNDADORES_DEV.map((f) => ({ ...f, entrouNaFamiliaEm: '2025-01-10' })),
    integrantes: [{ apelido: 'Kiko (conta infantil)', entrouNaFamiliaEm: '2025-06-01' }],
  })
  return executarBootstrap(b, readFileSync(b.regulamento, 'utf8'), JSON.stringify(b), agora)
}
