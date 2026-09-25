import { readFileSync } from 'node:fs'

import { bootstrapSchema } from '@/features/bootstrap/schema'
import { executarBootstrap } from '@/features/bootstrap/servico'
import { dadosCadastroSchema } from '@/features/onboarding/schemas'
import { assinarRegulamento, salvarDados } from '@/features/onboarding/servico'
import type { ContextoAcao } from '@/server/acao'
import { FAMILIA_PADRAO } from '@/server/familia'

import { dono } from './banco'

export const STEAMS = [
  '76561197960287930',
  '76561197960287931',
  '76561197960287932',
  '76561197960287933',
  '76561197960287934',
]
const APELIDOS = ['Ana', 'Bruno', 'Caio', 'Duda', 'Edu']
const texto = readFileSync('docs/regulamento/regulamento-v1.0.md', 'utf8')

export const ctxDe = (pessoaId: string, agora: Date) =>
  ({
    ator: { tipo: 'MEMBRO', pessoaId },
    agora,
    sessaoId: 's',
    perfil: {
      pessoaId,
      perfil: 'MEMBRO',
      familiaId: FAMILIA_PADRAO,
      membroId: 'm',
      statusMembro: 'ATIVO',
    },
  }) as ContextoAcao

/**
 * Bootstrap + os 5 fundadores assinando em `assinaturaEm` (padrão 28/09/2026 → ciclo 1 em
 * 03/10/2026, rodada 1 às 12:00). Devolve os ids em ordem (Ana…Edu) e o apelido por id.
 */
export async function prepararCiclo1(assinaturaEm = new Date('2026-09-28T12:00:00Z')) {
  await executarBootstrap(
    bootstrapSchema.parse({
      regulamento: 'x.md',
      fundadores: STEAMS.map((steam, i) => ({
        nome: `${APELIDOS[i] ?? ''} Silva`,
        apelido: APELIDOS[i],
        steam,
        entrouNaFamiliaEm: '2025-01-01',
      })),
    }),
    texto,
    '{}',
    new Date('2026-09-25T12:00:00Z'),
  )
  const pessoas = await dono.pessoa.findMany({
    orderBy: { steamId64: 'asc' },
    select: { id: true },
  })
  const ids = pessoas.map((p) => p.id)
  for (const [i, id] of ids.entries()) {
    const d = dadosCadastroSchema.parse({
      nome: `${APELIDOS[i] ?? ''} Silva`,
      apelido: APELIDOS[i],
      tipoChavePix: 'ALEATORIA',
      chavePix: `123e4567-e89b-12d3-a456-42661417400${String(i)}`,
      maioridade: 'on',
    })

    await salvarDados(ctxDe(id, assinaturaEm), d)

    await assinarRegulamento(ctxDe(id, assinaturaEm))
  }
  return ids
}

/**
 * Paga todas as contribuições abertas não autoquitadas. Forma diversa CONFIRMADA (conta pela
 * RN-FIN-06 e dispensa comprovante pelo CHECK pagamento_comprovante).
 */
export async function pagarTudo(pixEm: Date) {
  const abertas = await dono.obrigacao.findMany({
    where: {
      tipo: 'CONTRIBUICAO',
      autoquitada: false,
      canceladaEm: null,
      pagamentos: { none: {} },
    },
    select: { id: true, devedorId: true, credorId: true, valorCentavos: true },
  })
  await dono.pagamento.createMany({
    data: abertas.map((o) => ({
      obrigacaoId: o.id,
      recebedorId: o.credorId,
      valorCentavos: o.valorCentavos,
      pixEm,
      status: 'CONFIRMADO' as const,
      formaDiversa: true,
      confirmadoEm: pixEm,
      registradoPorId: o.devedorId,
      registradoEm: pixEm,
    })),
  })
}
