import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bibliotecaDaFamilia } from '@/features/steam/consultas'
import { atualizarApps, sincronizarPessoas, steamEmPausa } from '@/features/steam/sync'
import { criarApiSteam } from '@/server/steam/api'

import { criarMembro, dono, limpar } from './banco'
import cyberpunk from '../fixtures/steam/appdetails-1091500.json'
import stardew from '../fixtures/steam/appdetails-413150.json'
import cs2 from '../fixtures/steam/appdetails-730.json'
import privado from '../fixtures/steam/owned-games-privado.json'
import jogos from '../fixtures/steam/owned-games.json'
import resumos from '../fixtures/steam/player-summaries.json'
import wishlist from '../fixtures/steam/wishlist.json'

const ANA = '76561197960287930'
const BRUNO = '76561197960287931'
const json = (c: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(c), { status }))

/** API falsa: responde pelas fixtures reais conforme o endpoint (06 §8). */
function apiFalsa(opcoes: { privados?: string[]; limiteEm?: string; falhaApp?: string } = {}) {
  return criarApiSteam('chave-teste', (entrada) => {
    const url = new URL((entrada as URL).toString())
    if (opcoes.limiteEm && url.pathname.includes(opcoes.limiteEm)) return json({}, 429)
    if (url.pathname.includes('GetPlayerSummaries')) return json(resumos)
    if (url.pathname.includes('GetOwnedGames')) {
      return json(
        opcoes.privados?.includes(url.searchParams.get('steamid') ?? '') ? privado : jogos,
      )
    }
    if (url.pathname.includes('GetWishlist')) return json(wishlist)
    const appid = url.searchParams.get('appids')
    if (opcoes.falhaApp && appid === opcoes.falhaApp) return json({}, 500)
    const porId: Record<string, unknown> = { '413150': stardew, '1091500': cyberpunk, '730': cs2 }
    return json(porId[appid ?? ''] ?? { [appid ?? '0']: { success: false } })
  })
}

describe('sincronização Steam (RN-STM-04..12)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('perfil, biblioteca e lista de desejos; avatar de host estranho é descartado', async () => {
    const { pessoa: ana } = await criarMembro('ATIVO', 'Ana', ANA)
    const { pessoa: bruno } = await criarMembro('ATIVO', 'Bruno', BRUNO)
    const r = await sincronizarPessoas([ana.id, bruno.id], apiFalsa())
    expect(r).toMatchObject({ pessoas: 2, privadas: 0, pausou: false })
    const a = await dono.pessoa.findUniqueOrThrow({ where: { id: ana.id } })
    expect(a).toMatchObject({
      steamNick: 'ana_joga',
      steamPerfilPublico: true,
      steamJogosPublicos: true,
    })
    expect(a.steamAvatarUrl).toContain('avatars.steamstatic.com')
    const b = await dono.pessoa.findUniqueOrThrow({ where: { id: bruno.id } })
    expect(b.steamAvatarUrl).toBeNull() // evil.example.com (SEG-04)
    expect(await dono.jogoPossuido.count({ where: { pessoaId: ana.id } })).toBe(3)
    const lista = await dono.itemListaDesejos.findMany({
      where: { pessoaId: ana.id },
      orderBy: { posicao: 'asc' },
    })
    expect(lista.map((i) => i.appId)).toEqual([413150, 250900, 1091500, 367520, 1145360])
    expect(await dono.steamApp.count()).toBeGreaterThanOrEqual(6)
  })

  it('CA-109: GetOwnedGames {} → jogos privados; a biblioteca anterior é mantida', async () => {
    const { pessoa: ana } = await criarMembro('ATIVO', 'Ana', ANA)
    await sincronizarPessoas([ana.id], apiFalsa())
    await sincronizarPessoas([ana.id], apiFalsa({ privados: [ANA] }))
    const a = await dono.pessoa.findUniqueOrThrow({ where: { id: ana.id } })
    expect(a.steamJogosPublicos).toBe(false)
    expect(await dono.jogoPossuido.count({ where: { pessoaId: ana.id } })).toBe(3)
  })

  it('CA-110: appdetails 429 → pausa de 10 min; o tick seguinte não chama', async () => {
    await dono.steamApp.createMany({ data: [{ appId: 413150 }, { appId: 730 }] })
    const r = await atualizarApps(20, apiFalsa({ limiteEm: 'appdetails' }), () => Promise.resolve())
    expect(r.pausou).toBe(true)
    expect(await steamEmPausa(new Date())).toEqual(new Date('2026-10-01T12:10:00Z'))
    const chamadas = vi.fn<typeof fetch>(() => json(stardew))
    expect(
      await atualizarApps(20, criarApiSteam(undefined, chamadas), () => Promise.resolve()),
    ).toEqual({
      atualizados: 0,
      pausou: true,
    })
    expect(chamadas).not.toHaveBeenCalled()
  })

  it('CA-111 e CA-177: biblioteca compartilhável só com a categoria 62; desconhecidos "verificando"', async () => {
    const { pessoa: ana } = await criarMembro('ATIVO', 'Ana', ANA)
    await sincronizarPessoas([ana.id], apiFalsa())
    // a loja falha para o Cyberpunk: fica "verificando" (RN-STM-11)
    await atualizarApps(20, apiFalsa({ falhaApp: '1091500' }), () => Promise.resolve())
    const b = await bibliotecaDaFamilia()
    const porApp = new Map(b.map((j) => [j.appId, j]))
    expect(porApp.get(413150)?.compartilhavel).toBe('SIM') // Stardew tem 62
    expect(porApp.get(730)?.compartilhavel).toBe('NAO') // CS2 é F2P, sem 62
    expect(porApp.get(1091500)?.compartilhavel).toBe('VERIFICANDO')
    const cp = await dono.steamApp.findUniqueOrThrow({ where: { appId: 413150 } })
    expect(cp.imagemUrl).toContain('steamstatic.com')
    expect(JSON.stringify(cp)).not.toContain('<') // campos HTML do appdetails não são gravados
  })
})
