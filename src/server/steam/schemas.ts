// 06 §8: contratos zod das respostas da Steam. Campos HTML do appdetails não são lidos (SEG-04).
import { z } from 'zod'

export const playerSummariesSchema = z.object({
  response: z.object({
    players: z.array(
      z.object({
        steamid: z.string(),
        communityvisibilitystate: z.number(),
        personaname: z.string(),
        profileurl: z.string(),
        avatarfull: z.string(),
      }),
    ),
  }),
})

export const ownedGamesSchema = z.object({
  response: z.object({
    game_count: z.number().optional(),
    games: z
      .array(
        z.object({ appid: z.number(), name: z.string().optional(), playtime_forever: z.number() }),
      )
      .optional(),
  }),
})

export const wishlistSchema = z.object({
  response: z.object({
    items: z
      .array(z.object({ appid: z.number(), priority: z.number(), date_added: z.number() }))
      .optional(),
  }),
})

const dadosApp = z.object({
  steam_appid: z.number(),
  type: z.string(),
  name: z.string(),
  is_free: z.boolean(),
  price_overview: z
    .object({
      final: z.number(),
      initial: z.number().optional(),
      discount_percent: z.number().optional(),
      currency: z.string(),
    })
    .optional(),
  categories: z.array(z.object({ id: z.number() })).optional(),
  content_descriptors: z.object({ ids: z.array(z.number()).nullable() }).optional(),
  fullgame: z.object({ appid: z.coerce.number() }).optional(),
  release_date: z.object({ coming_soon: z.boolean(), date: z.string().optional() }).optional(),
  header_image: z.string().optional(),
  // 15 §5: informação para a lista de desejos e a página do jogo
  genres: z.array(z.object({ description: z.string() })).optional(),
  developers: z.array(z.string()).optional(),
  publishers: z.array(z.string()).optional(),
  metacritic: z.object({ score: z.number() }).optional(),
  short_description: z.string().optional(),
  screenshots: z.array(z.object({ path_thumbnail: z.string(), path_full: z.string() })).optional(),
})

/** RN-STM-08: a chave do objeto pode não ser o appId pedido — lê-se o primeiro valor. */
export const appDetailsSchema = z
  .record(z.string(), z.object({ success: z.boolean(), data: dadosApp.optional() }))
  .transform((r) => Object.values(r)[0])

/** ISteamUser/GetFriendList: lista privada responde 401 (tratado como lista vazia). */
export const friendListSchema = z.object({
  friendslist: z.object({
    friends: z.array(
      z.object({ steamid: z.string(), relationship: z.string(), friend_since: z.number() }),
    ),
  }),
})

/** ISteamUser/ResolveVanityURL: success 1 = achou; 42 = não existe. */
export const vanitySchema = z.object({
  response: z.object({ success: z.number(), steamid: z.string().optional() }),
})

/** 15 §5: resumo das avaliações da loja (appreviews, sem key; num_per_page=0 traz só o resumo). */
export const avaliacoesSchema = z.object({
  success: z.number(),
  query_summary: z
    .object({ review_score: z.int(), total_positive: z.int(), total_reviews: z.int() })
    .optional(),
})
