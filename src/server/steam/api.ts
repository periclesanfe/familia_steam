import 'server-only'

import type { z } from 'zod'

import { log } from '../log'
import {
  appDetailsSchema,
  avaliacoesSchema,
  friendListSchema,
  ownedGamesSchema,
  playerSummariesSchema,
  vanitySchema,
  wishlistSchema,
} from './schemas'

const WEB_API = 'https://api.steampowered.com'
const LOJA = 'https://store.steampowered.com'

/** 429/403 da Steam: o chamador grava a pausa global (RN-STM-10). */
export class LimiteSteam extends Error {}
export class FalhaSteam extends Error {}

export type ApiSteam = ReturnType<typeof criarApiSteam>

/**
 * 06 §8 / 14 SEG-06: URL montada de constante + searchParams; key no header x-webapi-key (a URL
 * nunca leva segredo); redirect: 'error'; 5 s de timeout. O fetch é injetado (testes).
 */
export function criarApiSteam(chave: string | undefined, buscar: typeof fetch = fetch) {
  async function chamar<S extends z.ZodType>(
    base: string,
    caminho: string,
    params: Record<string, string>,
    schema: S,
    comChave: boolean,
  ): Promise<z.output<S>> {
    const url = new URL(caminho, base)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    if (comChave && !chave) throw new FalhaSteam('STEAM_API_KEY ausente')
    const inicio = Date.now()
    let r: Response
    try {
      r = await buscar(url, {
        headers: comChave && chave ? { 'x-webapi-key': chave } : {},
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      })
    } catch (e) {
      log.aviso('steam.falha', {
        endpoint: caminho,
        erro: e instanceof Error ? e.name : 'desconhecido',
      })
      throw new FalhaSteam(caminho)
    }
    log.info('steam.chamada', { endpoint: caminho, status: r.status, ms: Date.now() - inicio })
    if (r.status === 429 || r.status === 403) throw new LimiteSteam(caminho)
    if (!r.ok) throw new FalhaSteam(`${caminho}: HTTP ${String(r.status)}`)
    const lido = schema.safeParse(await r.json())
    if (!lido.success) throw new FalhaSteam(`${caminho}: resposta fora do contrato`)
    return lido.data
  }

  return {
    /** RN-STM-05: até 100 ids por chamada. */
    resumos: (ids: readonly string[]) =>
      chamar(
        WEB_API,
        '/ISteamUser/GetPlayerSummaries/v2/',
        { steamids: ids.slice(0, 100).join(',') },
        playerSummariesSchema,
        true,
      ),
    /** RN-STM-06 */
    jogos: (steamId64: string) =>
      chamar(
        WEB_API,
        '/IPlayerService/GetOwnedGames/v1/',
        { steamid: steamId64, include_appinfo: '1', include_played_free_games: '1' },
        ownedGamesSchema,
        true,
      ),
    /** RN-STM-07 (sem key) */
    listaDesejos: (steamId64: string) =>
      chamar(
        WEB_API,
        '/IWishlistService/GetWishlist/v1/',
        { steamid: steamId64 },
        wishlistSchema,
        false,
      ),
    /** RN-FAM-04: amigos (lista pública) */
    amigos: (steamId64: string) =>
      chamar(
        WEB_API,
        '/ISteamUser/GetFriendList/v1/',
        { steamid: steamId64, relationship: 'friend' },
        friendListSchema,
        true,
      ),
    /** RN-FAM-04: /id/<nome> → SteamID64 */
    resolverVanity: (nome: string) =>
      chamar(WEB_API, '/ISteamUser/ResolveVanityURL/v1/', { vanityurl: nome }, vanitySchema, true),
    /** RN-STM-08: um appId por chamada, cc=br, l=brazilian (sem key, não oficial) */
    detalhes: (appId: number) =>
      chamar(
        LOJA,
        '/api/appdetails',
        { appids: String(appId), cc: 'br', l: 'brazilian' },
        appDetailsSchema,
        false,
      ),
    /** 15 §5: nota e totais das avaliações de todos os idiomas */
    avaliacoes: (appId: number) =>
      chamar(
        LOJA,
        `/appreviews/${String(appId)}`,
        { json: '1', language: 'all', purchase_type: 'all', num_per_page: '0' },
        avaliacoesSchema,
        false,
      ),
  }
}
