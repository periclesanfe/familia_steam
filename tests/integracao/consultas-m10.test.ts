import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  indicacoesDaFamilia,
  membrosDaMinhaFamilia,
  minhaArea,
} from '@/features/familias/consultas'
import { resumoDoPainel } from '@/features/painel/consultas'
import { calendarioDePromocoes } from '@/features/promocoes/consultas'
import { bibliotecaDaFamilia, detalheDoJogo, perfilDoMembro } from '@/features/steam/consultas'

import { contarConsultas, dono, limpar } from './banco'
import { prepararCiclo1 } from './fabricas'

/** n jogos, desejos, amigos, eventos de promoção e indicações para cada fundador (DP-16). */
async function volume(ids: string[], n: number) {
  const agora = new Date()
  const apps = Array.from({ length: n }, (_, i) => 1000 + i)
  await dono.steamApp.createMany({
    data: apps.map((appId) => ({
      appId,
      nome: `Jogo ${String(appId)}`,
      sucesso: true,
      categorias: [62],
      descontoPct: 30,
      precoFinalCentavos: 1000,
      avaliacaoNota: 8,
      avaliacoesPositivas: 90,
      avaliacoesTotal: 100,
    })),
  })
  await dono.precoApp.createMany({
    data: apps.map((appId) => ({ appId, em: agora, precoCentavos: 1000, descontoPct: 30 })),
  })
  await dono.jogoPossuido.createMany({
    data: ids.flatMap((pessoaId) =>
      apps.map((appId) => ({ pessoaId, appId, sincronizadoEm: agora })),
    ),
  })
  await dono.itemListaDesejos.createMany({
    data: ids.flatMap((pessoaId) =>
      apps.map((appId, posicao) => ({
        pessoaId,
        appId,
        origem: 'STEAM' as const,
        posicao: posicao + 1,
        adicionadoEm: agora,
      })),
    ),
  })
  await dono.amizadeSteam.createMany({
    data: apps.map((appId) => ({
      pessoaId: ids[0] ?? '',
      amigoSteamId64: `765611980000${String(appId).padStart(5, '0')}`,
      nick: `Amigo ${String(appId)}`,
      atualizadoEm: agora,
    })),
  })
  await dono.eventoPromocao.createMany({
    data: apps.map((appId, i) => ({
      nome: `Promoção ${String(appId)}`,
      inicio: new Date(Date.UTC(2026, 11, 1 + i)),
      fim: new Date(Date.UTC(2027, 0, 5)),
      fonteUrl: 'https://store.steampowered.com/news/',
      criadoPorId: ids[0] ?? '',
      criadoEm: agora,
    })),
  })
  for (const appId of apps) {
    const candidato = await dono.pessoa.create({
      data: {
        steamId64: `765611990000${String(appId).padStart(5, '0')}`,
        apelido: `C${String(appId)}`,
      },
    })

    await dono.indicacao.create({
      data: {
        candidatoSteamId64: candidato.steamId64 ?? '',
        candidatoId: candidato.id,
        indicadaPorId: ids[0] ?? '',
        criadaEm: agora,
        expiraEm: new Date(agora.getTime() + 7 * 86_400_000),
      },
    })
  }
}

async function medir(ana: string) {
  const agora = new Date()
  return {
    minhaArea: await contarConsultas(() => minhaArea(ana, agora)),
    membros: await contarConsultas(() => membrosDaMinhaFamilia(ana)),
    indicacoes: await contarConsultas(() => indicacoesDaFamilia(ana, agora)),
    painel: await contarConsultas(() => resumoDoPainel(ana, agora)),
    promocoes: await contarConsultas(() => calendarioDePromocoes(agora)),
    biblioteca: await contarConsultas(() => bibliotecaDaFamilia()),
    perfil: await contarConsultas(() => perfilDoMembro(ana)),
    jogo: await contarConsultas(() => detalheDoJogo(1000)),
  }
}

describe('consultas das páginas do M10 (13 DP-16)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-10T15:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('o nº de consultas não cresce com jogos, desejos, amigos, promoções e indicações (1 × 6)', async () => {
    const ids = await prepararCiclo1()
    await volume(ids, 1)
    const poucos = await medir(ids[0] ?? '')

    await limpar()
    const ids2 = await prepararCiclo1()
    await volume(ids2, 6)
    const muitos = await medir(ids2[0] ?? '')

    expect(muitos).toEqual(poucos)
    expect(Object.values(poucos).every((n) => n > 0)).toBe(true) // o contador enxerga cada consulta
    expect(await dono.jogoPossuido.count()).toBe(30)
    // e as consultas enxergam o volume (não mediram uma tela vazia)
    expect((await bibliotecaDaFamilia()).length).toBe(6)
    expect((await calendarioDePromocoes(new Date())).emPromocao.length).toBe(6)
  })
})
