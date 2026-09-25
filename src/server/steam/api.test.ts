import { describe, expect, it, vi } from 'vitest'

import { criarApiSteam, FalhaSteam, LimiteSteam } from './api'
import stardew from '../../../tests/fixtures/steam/appdetails-413150.json'

const resposta = (corpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status }))
const chamada = (f: ReturnType<typeof vi.fn<typeof fetch>>) => {
  const [url, init] = f.mock.calls[0] ?? []
  return { url: (url as URL).toString(), init }
}

describe('api Steam (06 §8, SEG-06)', () => {
  it('CA-173: key no header x-webapi-key, URL sem key=, redirect: error', async () => {
    const buscar = vi.fn<typeof fetch>(() => resposta({ response: { players: [] } }))
    await criarApiSteam('SEGREDO', buscar).resumos(['76561197960287930'])
    const { url, init } = chamada(buscar)
    expect(url).not.toContain('SEGREDO')
    expect(url).not.toContain('key=')
    expect(url.startsWith('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/')).toBe(
      true,
    )
    expect(init?.headers).toEqual({ 'x-webapi-key': 'SEGREDO' })
    expect(init?.redirect).toBe('error')
  })

  it('lista de desejos e appdetails não enviam a key', async () => {
    const buscar = vi.fn<typeof fetch>(() => resposta(stardew))
    const r = await criarApiSteam('SEGREDO', buscar).detalhes(413150)
    expect(r?.data?.categories?.map((c) => c.id)).toContain(62)
    const { url, init } = chamada(buscar)
    expect(init?.headers).toEqual({})
    expect(url).toContain('cc=br')
  })

  it('CA-108: chave do objeto diferente do appId pedido → usa o que veio', async () => {
    const buscar = vi.fn<typeof fetch>(() =>
      resposta({ '999': { success: true, data: { ...stardew['413150'].data, steam_appid: 999 } } }),
    )
    expect((await criarApiSteam(undefined, buscar).detalhes(413150))?.data?.steam_appid).toBe(999)
  })

  it('429/403 → LimiteSteam; outro erro → FalhaSteam; sem key → FalhaSteam sem chamar', async () => {
    await expect(criarApiSteam('k', () => resposta({}, 429)).detalhes(1)).rejects.toBeInstanceOf(
      LimiteSteam,
    )
    await expect(criarApiSteam('k', () => resposta({}, 500)).detalhes(1)).rejects.toBeInstanceOf(
      FalhaSteam,
    )
    await expect(
      criarApiSteam('k', () => Promise.reject(new TypeError('redirect'))).detalhes(1),
    ).rejects.toBeInstanceOf(FalhaSteam)
    const buscar = vi.fn<typeof fetch>()
    await expect(criarApiSteam(undefined, buscar).jogos('1')).rejects.toBeInstanceOf(FalhaSteam)
    expect(buscar).not.toHaveBeenCalled()
  })
})
