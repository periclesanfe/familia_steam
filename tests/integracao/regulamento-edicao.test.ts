import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hashVersao } from '@/domain/hash'
import { PARAMETROS_1_0 } from '@/domain/regulamento'
import { instanteLocal } from '@/domain/tempo'
import { bootstrapSchema } from '@/features/bootstrap/schema'
import { executarBootstrap } from '@/features/bootstrap/servico'
import { dadosCadastroSchema } from '@/features/onboarding/schemas'
import { assinarRegulamento, salvarDados } from '@/features/onboarding/servico'
import { revisoesDoRascunho } from '@/features/regulamento/consultas'
import { editarRascunho, proporAlteracao } from '@/features/regulamento/servico'
import { votar } from '@/features/votacoes/servico'

import { criarPessoa, dono, limpar } from './banco'
import { ctxDe, prepararCiclo1, STEAMS } from './fabricas'

const original = readFileSync('docs/regulamento/regulamento-v1.0.md', 'utf8')
const agora = () => new Date()
const novo = (marca: string) => `${original}\n\n## Nota da família\n\n${marca}\n`

async function bootstrap() {
  await executarBootstrap(
    bootstrapSchema.parse({
      regulamento: 'x.md',
      fundadores: STEAMS.slice(0, 2).map((steam, i) => ({
        nome: `Pessoa ${String(i)}`,
        apelido: `P${String(i)}`,
        steam,
        entrouNaFamiliaEm: '2025-01-01',
      })),
    }),
    original,
    '{}',
    new Date('2026-09-25T12:00:00Z'),
  )
  const pessoas = await dono.pessoa.findMany({
    orderBy: { steamId64: 'asc' },
    select: { id: true },
  })
  return pessoas.map((p) => p.id)
}

const cadastrarEAssinar = async (id: string, i: number) => {
  await salvarDados(
    ctxDe(id, agora()),
    dadosCadastroSchema.parse({
      nome: `Pessoa ${String(i)} Silva`,
      apelido: `P${String(i)}`,
      tipoChavePix: 'ALEATORIA',
      chavePix: `123e4567-e89b-12d3-a456-42661417400${String(i)}`,
      maioridade: 'on',
    }),
  )
  await assinarRegulamento(ctxDe(id, agora()))
}

describe('edição do Regulamento (RN-REG-08, RN-REG-03)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-26T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-197: antes da vigência, B edita o rascunho; a assinatura de A cai e a revisão fica no histórico', async () => {
    const [a = '', b = ''] = await bootstrap()
    await cadastrarEAssinar(a, 0)
    const texto = novo('Combinamos pagar até o dia 5.')
    const r = await editarRascunho(ctxDe(b, agora()), {
      texto,
      parametros: PARAMETROS_1_0,
      resumo: 'Nota sobre o dia de pagamento',
    })
    expect(r.assinaturasInvalidadas).toBe(1)
    const v = await dono.versaoRegulamento.findFirstOrThrow({ where: { ordem: 0 } })
    expect(v).toMatchObject({ textoMarkdown: texto, sha256: hashVersao(texto, PARAMETROS_1_0) })
    const [rev] = await revisoesDoRascunho()
    expect(rev).toMatchObject({
      resumo: 'Nota sobre o dia de pagamento',
      assinaturasInvalidadas: 1,
    })
    expect(rev?.trechos).toContainEqual({
      tipo: 'incluida',
      texto: 'Combinamos pagar até o dia 5.',
    })
    // A assina de novo o texto final; com B, o acordo entra em vigor com o novo hash
    await cadastrarEAssinar(a, 0)
    await cadastrarEAssinar(b, 1)
    const vigente = await dono.versaoRegulamento.findFirstOrThrow({ where: { ordem: 0 } })
    expect(vigente.vigenteDesde).not.toBeNull()
    expect(await dono.adesao.count({ where: { sha256Versao: vigente.sha256 } })).toBe(2)
  })

  it('CA-198: em vigor, a edição direta é recusada; a proposta vai a votação e, aprovada, vale em 1º do mês seguinte', async () => {
    const [a = '', b = '', c = ''] = await prepararCiclo1()
    vi.setSystemTime(instanteLocal('2026-10-05', '18:00'))
    const e = { texto: novo('Nova regra.'), parametros: PARAMETROS_1_0, resumo: 'Nova regra' }
    await expect(editarRascunho(ctxDe(a, agora()), e)).rejects.toMatchObject({
      codigo: 'REGULAMENTO_EM_VIGOR',
    })
    const { votacaoId } = await proporAlteracao(ctxDe(a, agora()), {
      ...e,
      justificativa: 'Precisamos registrar a regra',
    })
    expect(await dono.votacao.findUniqueOrThrow({ where: { id: votacaoId } })).toMatchObject({
      assunto: 'ALTERACAO_REGULAMENTO',
      proposicao: 'Aprovar a alteração do Regulamento: Nova regra',
    })
    for (const x of [a, b, c]) await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
    const v11 = await dono.versaoRegulamento.findFirstOrThrow({ where: { ordem: 1 } })
    expect(v11).toMatchObject({
      numero: '1.1',
      textoMarkdown: e.texto,
      resumoAlteracoes: 'Nova regra',
    })
    expect(v11.vigenteDesde).toEqual(instanteLocal('2026-11-01'))
  })

  it('CA-199: segunda proposta com uma já aberta → VOTACAO_DUPLICADA', async () => {
    const [a = '', b = ''] = await prepararCiclo1()
    vi.setSystemTime(instanteLocal('2026-10-05', '18:00'))
    const e = (m: string) => ({
      texto: novo(m),
      parametros: PARAMETROS_1_0,
      resumo: `Proposta ${m}`,
      justificativa: 'Justificativa da proposta',
    })
    await proporAlteracao(ctxDe(a, agora()), e('um'))
    await expect(proporAlteracao(ctxDe(b, agora()), e('dois'))).rejects.toMatchObject({
      codigo: 'VOTACAO_DUPLICADA',
    })
  })

  it('CA-200: quem não é da família não edita; texto igual ao atual é recusado', async () => {
    const [a = ''] = await bootstrap()
    const visitante = await criarPessoa('Zé', '76561197960287999')
    const e = { texto: novo('x'), parametros: PARAMETROS_1_0, resumo: 'Tentativa de fora' }
    await expect(editarRascunho(ctxDe(visitante.id, agora()), e)).rejects.toMatchObject({
      codigo: 'SEM_PERMISSAO',
    })
    await expect(
      editarRascunho(ctxDe(a, agora()), { ...e, texto: original, resumo: 'Sem mudança' }),
    ).rejects.toMatchObject({ codigo: 'SEM_ALTERACAO' })
    expect(await revisoesDoRascunho()).toEqual([])
  })
})
