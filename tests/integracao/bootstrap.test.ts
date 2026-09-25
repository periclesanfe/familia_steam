import { readFileSync } from 'node:fs'

import { beforeEach, describe, expect, it } from 'vitest'

import { hashVersao } from '@/domain/hash'
import { adesaoValida, codigoAmigo, PARAMETROS_1_0 } from '@/domain/regulamento'
import { bootstrapSchema } from '@/features/bootstrap/schema'
import { corrigirBootstrap, executarBootstrap } from '@/features/bootstrap/servico'

import { dono, limpar } from './banco'

const texto = readFileSync('docs/regulamento/regulamento-v1.0.md', 'utf8')
const agora = new Date('2026-09-26T12:00:00Z')

const arquivo = (ajuste: { steamAna?: string; nomeAna?: string } = {}) =>
  bootstrapSchema.parse({
    regulamento: 'docs/regulamento/regulamento-v1.0.md',
    fundadores: [
      {
        nome: ajuste.nomeAna ?? 'Ana Souza',
        apelido: 'Ana',
        steam: ajuste.steamAna ?? '76561197960287930',
        entrouNaFamiliaEm: '2025-01-10',
      },
      {
        nome: 'Bruno Lima',
        apelido: 'Bruno',
        steam: 'https://steamcommunity.com/profiles/76561197960287931/',
        entrouNaFamiliaEm: '2025-01-10',
      },
    ],
    integrantes: [{ apelido: 'Kiko', entrouNaFamiliaEm: '2025-06-01' }],
  })

describe('bootstrap (RN-ACE-10)', () => {
  beforeEach(limpar)

  it('cria fundadores, integrantes, versão 1.0 com hash, Anexo I 01 e o evento gênese', async () => {
    const r = await executarBootstrap(arquivo(), texto, '{}', agora)
    expect(r.sha256Versao).toBe(hashVersao(texto, PARAMETROS_1_0))
    const membros = await dono.membro.findMany({
      include: { pessoa: { include: { integrantes: true } } },
    })
    expect(membros.map((m) => [m.pessoa.apelido, m.status, m.origem])).toEqual(
      expect.arrayContaining([
        ['Ana', 'AGUARDANDO_ADESAO', 'FUNDADOR'],
        ['Bruno', 'AGUARDANDO_ADESAO', 'FUNDADOR'],
      ]),
    )
    expect(membros.find((m) => m.pessoa.apelido === 'Bruno')?.pessoa.steamId64).toBe(
      '76561197960287931',
    )
    const kiko = await dono.pessoa.findFirstOrThrow({
      where: { apelido: 'Kiko' },
      include: { membros: true, integrantes: true },
    })
    expect(kiko.membros).toHaveLength(0) // integrante não membro: sem login (RN-CAD-06)
    expect(kiko.integrantes[0]?.status).toBe('ATIVO')
    const v = await dono.versaoRegulamento.findUniqueOrThrow({ where: { ordem: 0 } })
    expect([v.numero, v.vigenteDesde]).toEqual(['1.0', null])
    expect(await dono.jogoBloqueado.findUnique({ where: { numero: 1 } })).toMatchObject({
      protegida: true,
      tipo: 'CATEGORIA',
    })
    expect(
      await dono.eventoAuditoria.count({
        where: { acao: 'bootstrap.genese', atorTipo: 'OPERADOR' },
      }),
    ).toBe(1)
  })

  it('roda uma vez só', async () => {
    await executarBootstrap(arquivo(), texto, '{}', agora)
    await expect(executarBootstrap(arquivo(), texto, '{}', agora)).rejects.toThrow(/uma vez só/)
  })

  it('CA-90: texto alterado antes da vigência invalida as adesões anteriores', async () => {
    await executarBootstrap(arquivo(), texto, '{}', agora)
    const antes = await dono.versaoRegulamento.findUniqueOrThrow({ where: { ordem: 0 } })
    const adesao = { sha256Versao: antes.sha256, codigoAmigo: codigoAmigo('76561197960287930') }
    await corrigirBootstrap(arquivo(), `${texto}\nCorreção de redação.`, agora)
    const depois = await dono.versaoRegulamento.findUniqueOrThrow({ where: { ordem: 0 } })
    expect(depois.sha256).not.toBe(antes.sha256)
    expect(adesaoValida(adesao, depois, { steamId64: '76561197960287930' })).toBe(false)
  })

  it('CA-125: SteamID de fundador trocado → adesão dele inválida e sessões revogadas', async () => {
    await executarBootstrap(arquivo(), texto, '{}', agora)
    const ana = await dono.pessoa.findFirstOrThrow({ where: { apelido: 'Ana' } })
    await dono.sessao.create({
      data: {
        tokenHash: 'a'.repeat(64),
        pessoaId: ana.id,
        criadaEm: agora,
        expiraEm: new Date('2030-01-01'),
      },
    })
    const v = await dono.versaoRegulamento.findUniqueOrThrow({ where: { ordem: 0 } })
    const adesao = { sha256Versao: v.sha256, codigoAmigo: codigoAmigo('76561197960287930') }

    const r = await corrigirBootstrap(arquivo({ steamAna: '76561197960287940' }), texto, agora)
    expect(r.alteracoes).toEqual(['fundador Ana'])
    const nova = await dono.pessoa.findUniqueOrThrow({
      where: { id: ana.id },
      include: { integrantes: true },
    })
    expect(nova.steamId64).toBe('76561197960287940')
    expect(nova.integrantes[0]?.steamId64).toBe('76561197960287940')
    expect(adesaoValida(adesao, v, { steamId64: nova.steamId64 ?? '' })).toBe(false)
    expect(await dono.sessao.count({ where: { pessoaId: ana.id, revogadaEm: null } })).toBe(0)
  })

  it('depois da vigência a CLI recusa escrever', async () => {
    await executarBootstrap(arquivo(), texto, '{}', agora)
    await dono.versaoRegulamento.update({ where: { ordem: 0 }, data: { vigenteDesde: agora } })
    await expect(corrigirBootstrap(arquivo({ nomeAna: 'Ana S.' }), texto, agora)).rejects.toThrow(
      /vigente/,
    )
  })

  it('arquivo inválido: SteamID fora do intervalo, apelido repetido, URL personalizada', () => {
    const base = { regulamento: 'x.md', integrantes: [] }
    const f = (steam: string, apelido = 'A') => ({
      nome: 'Fulano',
      apelido,
      steam,
      entrouNaFamiliaEm: '2025-01-01',
    })
    expect(
      bootstrapSchema.safeParse({
        ...base,
        fundadores: [f('76561197960265728'), f('76561197960287931', 'B')],
      }).success,
    ).toBe(false)
    expect(
      bootstrapSchema.safeParse({
        ...base,
        fundadores: [f('76561197960287930'), f('76561197960287931')],
      }).success,
    ).toBe(false)
    expect(
      bootstrapSchema.safeParse({
        ...base,
        fundadores: [f('https://steamcommunity.com/id/ana'), f('76561197960287931', 'B')],
      }).success,
    ).toBe(false)
  })
})
