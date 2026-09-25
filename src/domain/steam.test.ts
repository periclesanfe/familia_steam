import { describe, expect, it } from 'vitest'

import { appIdDeTexto, avaliacaoDaLoja, imagemSteamSegura, ordenarListaDesejos } from './steam'
import wishlist from '../../tests/fixtures/steam/wishlist.json'

describe('Steam (regras puras)', () => {
  it('CA-107: priority [0,0,1,2,2] → 1, 2, 2 (por data), depois os 0 (por data)', () => {
    const r = ordenarListaDesejos(wishlist.response.items)
    expect(r.map((i) => [i.appid, i.posicao])).toEqual([
      [413150, 1],
      [250900, 2],
      [1091500, 3],
      [367520, 4],
      [1145360, 5],
    ])
  })

  it('CA-174: appId sai do link da loja; outros links não são aceitos', () => {
    expect(appIdDeTexto('https://store.steampowered.com/app/413150/Stardew_Valley/')).toBe(413150)
    expect(appIdDeTexto('413150')).toBe(413150)
    expect(appIdDeTexto('https://evil.example.com/app/413150')).toBeNull()
    expect(appIdDeTexto('http://127.0.0.1/app/1')).toBeNull()
    expect(appIdDeTexto('0')).toBeNull()
  })

  it('CA-177 (imagem): só https de *.steamstatic.com', () => {
    expect(imagemSteamSegura('https://shared.akamai.steamstatic.com/a/header.jpg?t=1')).toContain(
      'steamstatic.com',
    )
    expect(imagemSteamSegura('https://evil.example.com/x.jpg')).toBeNull()
    expect(imagemSteamSegura('http://cdn.akamai.steamstatic.com/x.jpg')).toBeNull()
    expect(imagemSteamSegura('https://steamstatic.com.evil.io/x.jpg')).toBeNull()
    expect(imagemSteamSegura('javascript:alert(1)')).toBeNull()
  })

  it('avaliações da loja: termo da Steam, % positivas e tom', () => {
    expect(
      avaliacaoDaLoja({ avaliacaoNota: 9, avaliacoesPositivas: 1024466, avaliacoesTotal: 1040284 }),
    ).toEqual({ rotulo: 'Extremamente positivas', pct: 98, total: 1040284, tom: 'sucesso' })
    expect(
      avaliacaoDaLoja({ avaliacaoNota: 5, avaliacoesPositivas: 50, avaliacoesTotal: 100 })?.tom,
    ).toBe('atencao')
    expect(
      avaliacaoDaLoja({ avaliacaoNota: 0, avaliacoesPositivas: 0, avaliacoesTotal: 0 }),
    ).toMatchObject({ rotulo: 'Poucas avaliações', pct: null })
    expect(
      avaliacaoDaLoja({ avaliacaoNota: null, avaliacoesPositivas: null, avaliacoesTotal: null }),
    ).toBeNull()
  })
})
