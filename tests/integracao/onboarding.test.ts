import { readFileSync } from 'node:fs'

import { beforeEach, describe, expect, it } from 'vitest'

import { instanteLocal } from '@/domain/tempo'
import { bootstrapSchema } from '@/features/bootstrap/schema'
import { executarBootstrap } from '@/features/bootstrap/servico'
import { dadosCadastroSchema } from '@/features/onboarding/schemas'
import { assinarRegulamento, salvarDados } from '@/features/onboarding/servico'
import type { ContextoAcao } from '@/server/acao'

import { dono, limpar } from './banco'

const texto = readFileSync('docs/regulamento/regulamento-v1.0.md', 'utf8')
const STEAMS = [
  '76561197960287930',
  '76561197960287931',
  '76561197960287932',
  '76561197960287933',
  '76561197960287934',
]

async function preparar() {
  await executarBootstrap(
    bootstrapSchema.parse({
      regulamento: 'x.md',
      fundadores: STEAMS.map((steam, i) => ({
        nome: `Pessoa ${String(i)}`,
        apelido: `P${String(i)}`,
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
    include: { membros: true },
  })
  return pessoas.map((p) => p.id)
}

const ctx = (pessoaId: string, agora: Date) =>
  ({
    ator: { tipo: 'MEMBRO', pessoaId },
    agora,
    sessaoId: 's',
    perfil: { pessoaId, perfil: 'PENDENTE', membroId: 'm', statusMembro: 'AGUARDANDO_ADESAO' },
  }) as ContextoAcao

const dados = (i: number) =>
  dadosCadastroSchema.parse({
    nome: `Pessoa ${String(i)} Silva`,
    apelido: `P${String(i)}`,
    tipoChavePix: 'ALEATORIA',
    chavePix: `123e4567-e89b-12d3-a456-42661417400${String(i)}`,
    maioridade: 'on',
  })

async function cadastrarEAssinar(id: string, i: number, agora: Date) {
  await salvarDados(ctx(id, agora), dados(i))
  await assinarRegulamento(ctx(id, agora))
}

describe('onboarding e vigência (RN-ACE-06, RN-REG-01, RN-CIC-01)', () => {
  beforeEach(limpar)

  it.each([
    ['02/10 23:50', instanteLocal('2026-10-02', '23:50'), '2026-10-03', '2026-10-03T15:00:00.000Z'],
    ['03/10 10:00', instanteLocal('2026-10-03', '10:00'), '2026-11-03', '2026-11-03T15:00:00.000Z'],
  ])('CA-88: 5ª assinatura em %s → ciclo 1 em %s', async (_, ultima, inicio, sorteio) => {
    const ids = await preparar()
    for (const [i, id] of ids.slice(0, 4).entries()) {
      await cadastrarEAssinar(id, i, new Date('2026-09-28T12:00:00Z'))
    }
    expect(await dono.ciclo.count()).toBe(0)
    expect((await dono.versaoRegulamento.findFirstOrThrow()).vigenteDesde).toBeNull()

    await cadastrarEAssinar(ids[4] ?? '', 4, ultima)
    const v = await dono.versaoRegulamento.findFirstOrThrow()
    expect(v.vigenteDesde).toEqual(ultima)
    expect(await dono.membro.count({ where: { status: 'ATIVO', ativadoEm: ultima } })).toBe(5)
    const ciclo = await dono.ciclo.findFirstOrThrow({ include: { rodadas: true } })
    expect([ciclo.numero, ciclo.status, ciclo.dataInicio.toISOString().slice(0, 10)]).toEqual([
      1,
      'PLANEJADO',
      inicio,
    ])
    expect(ciclo.rodadas).toHaveLength(1)
    expect(ciclo.rodadas[0]).toMatchObject({
      sequencia: 1,
      status: 'AGENDADA',
      mesReferencia: inicio.slice(0, 7),
    })
    expect(ciclo.rodadas[0]?.agendadaPara.toISOString()).toBe(sorteio)
  })

  it('assinatura exige cadastro completo, grava declaração literal e Pix mascarado; não assina duas vezes', async () => {
    const [ana = ''] = await preparar()
    const agora = new Date('2026-09-28T12:00:00Z')
    await expect(assinarRegulamento(ctx(ana, agora))).rejects.toMatchObject({
      codigo: 'ENTRADA_INVALIDA',
    })
    await salvarDados(ctx(ana, agora), dados(0))
    await assinarRegulamento(ctx(ana, agora))
    const a = await dono.adesao.findFirstOrThrow()
    expect(a.declaracao).toContain('versão 1.0')
    expect(a.chavePixMascarada).toBe('****4000')
    await expect(assinarRegulamento(ctx(ana, agora))).rejects.toMatchObject({
      codigo: 'ENTRADA_INVALIDA',
    })
    const evento = await dono.eventoAuditoria.findFirstOrThrow({
      where: { acao: 'pessoa.cadastro' },
    })
    expect(JSON.stringify(evento.dados)).not.toContain('123e4567')
  })

  it('CA-95: mesmo SteamID em outra pessoa e segundo vínculo aberto são recusados pelo banco', async () => {
    const [ana = ''] = await preparar()
    await expect(
      dono.pessoa.create({ data: { apelido: 'Clone', steamId64: STEAMS[0] ?? '' } }),
    ).rejects.toThrow()
    await expect(
      dono.membro.create({ data: { pessoaId: ana, origem: 'FUNDADOR', status: 'ATIVO' } }),
    ).rejects.toThrow()
  })

  it('chave Pix validada e normalizada pelo tipo', () => {
    const base = { nome: 'Ana Souza', apelido: 'Ana', maioridade: 'on' }
    const ok = (tipoChavePix: string, chavePix: string) =>
      dadosCadastroSchema.safeParse({ ...base, tipoChavePix, chavePix })
    expect(ok('CPF', '123.456.789-09').data?.chavePix).toBe('12345678909')
    expect(ok('TELEFONE', '(11) 99999-8888').data?.chavePix).toBe('+5511999998888')
    expect(ok('EMAIL', 'Ana@Exemplo.com').data?.chavePix).toBe('ana@exemplo.com')
    expect(ok('CPF', '123').success).toBe(false)
    expect(ok('ALEATORIA', 'nao-e-uuid').success).toBe(false)
    expect(
      dadosCadastroSchema.safeParse({
        ...base,
        maioridade: undefined,
        tipoChavePix: 'CPF',
        chavePix: '12345678909',
      }).success,
    ).toBe(false)
  })
})
