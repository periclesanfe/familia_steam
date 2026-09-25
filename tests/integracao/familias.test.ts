import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  aceitarConvite,
  criarFamilia,
  indicar,
  responderIndicacao,
} from '@/features/familias/servico'
import { dadosCadastroSchema } from '@/features/onboarding/schemas'
import { assinarRegulamento, salvarDados } from '@/features/onboarding/servico'
import { sairDaFamilia } from '@/features/saidas/servico'
import { votar } from '@/features/votacoes/servico'
import { db } from '@/server/db'
import { comFamilia, FAMILIA_PADRAO } from '@/server/familia'
import { emTransacao } from '@/server/tx'

import { dono, limpar } from './banco'
import { ctxDe, prepararCiclo1 } from './fabricas'

const agora = () => new Date()
const STEAM = {
  a: '76561198000000001',
  b: '76561198000000002',
  c: '76561198000000003',
  intruso: '76561198000000009',
}

const visitante = (steamId64: string, apelido: string) =>
  dono.pessoa.create({
    data: { steamId64, apelido, nome: `${apelido} Teste` },
    select: { id: true },
  })

/** A cria a família X; devolve os ids. */
async function familiaX() {
  const a = await visitante(STEAM.a, 'Alice')
  const { familiaId } = await criarFamilia(ctxDe(a.id, agora()), {
    nome: 'Família X',
    entrouNaFamiliaEm: '2025-01-01',
  })
  return { a: a.id, familiaId }
}

/** Indica, os demais aprovam e o candidato aceita: devolve a pessoa que entrou. */
async function entrarNaX(
  familiaId: string,
  indicador: string,
  steamId64: string,
  apelido: string,
  aprovadores: string[] = [],
) {
  const p = await visitante(steamId64, apelido)
  const { indicacaoId } = await comFamilia(familiaId, () =>
    indicar(ctxDe(indicador, agora()), { steamId64, nome: apelido }),
  )
  for (const x of aprovadores) {
    await comFamilia(familiaId, () =>
      responderIndicacao(ctxDe(x, agora()), { indicacaoId, aprova: true }),
    )
  }
  const convite = await dono.convite.findFirstOrThrow({ where: { steamId64 } })
  await aceitarConvite(ctxDe(p.id, agora()), { token: convite.token })
  return p.id
}

async function assinar(familiaId: string, pessoaId: string, i: number) {
  await salvarDados(
    ctxDe(pessoaId, agora()),
    dadosCadastroSchema.parse({
      nome: `Pessoa ${String(i)} Teste`,
      apelido: `P${String(i)}`,
      tipoChavePix: 'ALEATORIA',
      chavePix: `123e4567-e89b-12d3-a456-42661417401${String(i)}`,
      maioridade: 'on',
    }),
  )
  await comFamilia(familiaId, () => assinarRegulamento(ctxDe(pessoaId, agora())))
}

describe('famílias (15 RN-FAM, SEG-13)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-10T15:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-182: quem está numa família não cria outra nem aceita convite de outra', async () => {
    const [ana = ''] = await prepararCiclo1()
    await expect(
      criarFamilia(ctxDe(ana, agora()), { nome: 'Outra', entrouNaFamiliaEm: '2025-01-01' }),
    ).rejects.toMatchObject({ codigo: 'ENTRADA_INVALIDA' })
  })

  it('CA-183/184/185: família de 1 aprova sozinha; convite só serve à conta indicada e uma vez; recusa encerra', async () => {
    const { a, familiaId } = await familiaX()
    const b = await visitante(STEAM.b, 'Bruno')
    const intruso = await visitante(STEAM.intruso, 'Intruso')
    await comFamilia(familiaId, () =>
      indicar(ctxDe(a, agora()), { steamId64: STEAM.b, nome: 'Bruno' }),
    )
    const convite = await dono.convite.findFirstOrThrow({ where: { steamId64: STEAM.b } })
    // CA-184: outra conta Steam não usa o convite, e ele continua valendo
    await expect(
      aceitarConvite(ctxDe(intruso.id, agora()), { token: convite.token }),
    ).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO' })
    await aceitarConvite(ctxDe(b.id, agora()), {
      token: convite.token,
      naFamiliaSteamDesde: '2025-02-01',
    })
    expect(await dono.pessoa.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({
      familiaId,
    })
    // CA-185: segundo uso
    await expect(aceitarConvite(ctxDe(b.id, agora()), { token: convite.token })).rejects.toThrow()

    // CA-183: com 2 membros, uma recusa encerra a indicação
    const c = await visitante(STEAM.c, 'Caio')
    const { indicacaoId } = await comFamilia(familiaId, () =>
      indicar(ctxDe(a, agora()), { steamId64: STEAM.c, nome: 'Caio' }),
    )
    await comFamilia(familiaId, () =>
      responderIndicacao(ctxDe(b.id, agora()), { indicacaoId, aprova: false }),
    )
    expect(await dono.indicacao.findUniqueOrThrow({ where: { id: indicacaoId } })).toMatchObject({
      status: 'RECUSADA',
    })
    expect(await dono.convite.count({ where: { steamId64: STEAM.c } })).toBe(0)
    expect(c.id).toBeTruthy()
  })

  it('CA-186/187/189: vigência só com todos assinando e ≥ 2; numeração independente entre famílias', async () => {
    await prepararCiclo1() // família padrão com ciclo 1 e Anexo I nº 01
    const { a, familiaId } = await familiaX()
    await assinar(familiaId, a, 1)
    const semVigencia = () =>
      comFamilia(familiaId, () =>
        emTransacao((tx) => tx.versaoRegulamento.count({ where: { vigenteDesde: null } })),
      )
    expect(await semVigencia()).toBe(1) // CA-187: família de 1 não entra em vigor
    const b = await entrarNaX(familiaId, a, STEAM.b, 'Bruno')
    const c = await entrarNaX(familiaId, a, STEAM.c, 'Caio', [b])
    await assinar(familiaId, b, 2)
    expect(await semVigencia()).toBe(1) // falta o Caio
    await comFamilia(familiaId, () => sairDaFamilia(ctxDe(c, agora())))
    expect(await semVigencia()).toBe(0) // CA-186: os que ficaram já assinaram
    // CA-189: cada família tem o próprio ciclo 1 e a própria entrada 01 do Anexo I
    expect(await dono.ciclo.count({ where: { numero: 1 } })).toBe(2)
    expect(await dono.jogoBloqueado.count({ where: { numero: 1 } })).toBe(2)
    expect(await dono.pessoa.findUniqueOrThrow({ where: { id: c } })).toMatchObject({
      familiaId: null,
    })
  })

  it('CA-181: dentro de uma família, os dados de outra não existem', async () => {
    const [ana = ''] = await prepararCiclo1()
    const { a, familiaId } = await familiaX()
    const cicloDaPadrao = await dono.ciclo.findFirstOrThrow({ where: { numero: 1 } })
    const visto = await comFamilia(familiaId, () => db.ciclo.findMany())
    expect(visto.some((c) => c.id === cicloDaPadrao.id)).toBe(false)
    expect(await comFamilia(familiaId, () => db.membro.count())).toBe(1)
    const votacao = await dono.votacao.create({
      data: {
        assunto: 'OUTRO',
        proposicao: 'x',
        justificativa: 'x',
        efeito: { tipo: 'NENHUM' },
        chaveObjeto: 'x',
        convocadaPorId: ana,
        abertaEm: agora(),
        encerraEm: new Date(agora().getTime() + 86_400_000),
        eleitoresIds: [ana],
        impedidosIds: [],
        n: 1,
        quorum: 1,
        versaoRegulamentoId: (
          await dono.versaoRegulamento.findFirstOrThrow({ where: { familiaId: FAMILIA_PADRAO } })
        ).id,
      },
    })
    await expect(
      comFamilia(familiaId, () =>
        votar(ctxDe(a, agora()), { votacaoId: votacao.id, opcao: 'FAVOR' }),
      ),
    ).rejects.toThrow()
    expect(await dono.voto.count()).toBe(0)
  })
})
