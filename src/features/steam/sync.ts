import 'server-only'

import { imagemSteamSegura, ordenarListaDesejos, textoSemHtml } from '@/domain/steam'
import { db, dbBase } from '@/server/db'
import { env } from '@/server/env'
import { log } from '@/server/log'
import { agora } from '@/server/relogio'
import { type ApiSteam, criarApiSteam, LimiteSteam } from '@/server/steam/api'

const PAUSA_MS = 10 * 60_000
const DETALHES_VALIDOS_MS = 7 * 86_400_000
const PRECO_VALIDO_MS = 86_400_000

export const apiPadrao = (): ApiSteam => criarApiSteam(env().STEAM_API_KEY)

/** RN-STM-10: pausa global depois de 429/403 da Steam. */
export async function steamEmPausa(t: Date): Promise<Date | null> {
  const c = await db.controle.findUnique({ where: { chave: 'steam_pausa' }, select: { ate: true } })
  return c?.ate && c.ate > t ? c.ate : null
}

async function pausar(t: Date) {
  await db.controle.update({
    where: { chave: 'steam_pausa' },
    data: { ate: new Date(t.getTime() + PAUSA_MS) },
  })
  log.aviso('steam.pausa', { ate: new Date(t.getTime() + PAUSA_MS).toISOString() })
}

export type ResumoSync = { pessoas: number; privadas: number; pausou: boolean; falhas: number }

/**
 * RN-STM-04..07: perfil (em lote), biblioteca e lista de desejos. Chamadas externas fora de
 * transação; gravação curta por pessoa depois (13 DP-08/DP-13). Desde o M10 toda pessoa tem a
 * lista de desejos (área pessoal e indicação, 15 §1).
 */
export async function sincronizarPessoas(
  ids: readonly string[],
  api: ApiSteam = apiPadrao(),
): Promise<ResumoSync> {
  const t = agora()
  const resumo: ResumoSync = { pessoas: 0, privadas: 0, pausou: false, falhas: 0 }
  if (ids.length === 0 || (await steamEmPausa(t))) return resumo

  const pessoas = await db.pessoa.findMany({
    where: { id: { in: [...ids] }, steamId64: { not: null } },
    select: { id: true, steamId64: true },
  })
  const comSteam = pessoas.flatMap((p) => (p.steamId64 ? [{ ...p, steamId64: p.steamId64 }] : []))
  if (comSteam.length === 0) return resumo

  try {
    // RN-STM-05: uma chamada para todos (até 100)
    const { response } = await api.resumos(comSteam.map((p) => p.steamId64))
    await dbBase.$transaction(
      response.players.flatMap((j) => {
        const p = comSteam.find((x) => x.steamId64 === j.steamid)
        return p
          ? [
              db.pessoa.update({
                where: { id: p.id },
                data: {
                  steamNick: j.personaname.slice(0, 64),
                  steamAvatarUrl: imagemSteamSegura(j.avatarfull),
                  steamPerfilUrl: j.profileurl.startsWith('https://steamcommunity.com/')
                    ? j.profileurl
                    : null,
                  steamPerfilPublico: j.communityvisibilitystate === 3,
                },
              }),
            ]
          : []
      }),
    )
  } catch (e) {
    if (e instanceof LimiteSteam) {
      await pausar(t)
      return { ...resumo, pausou: true }
    }
    resumo.falhas++
  }

  for (const p of comSteam) {
    try {
      // eslint-disable-next-line no-await-in-loop -- uma chamada por pessoa (a API não aceita lote); 5 pessoas
      const jogos = await api.jogos(p.steamId64)
      // eslint-disable-next-line no-await-in-loop -- idem
      const desejos = await api.listaDesejos(p.steamId64)
      // eslint-disable-next-line no-await-in-loop -- gravação curta por pessoa, depois das chamadas
      await gravarPessoa(p.id, jogos.response.games, desejos.response.items, t)
      resumo.pessoas++
      if (!jogos.response.games) resumo.privadas++
    } catch (e) {
      if (e instanceof LimiteSteam) {
        // eslint-disable-next-line no-await-in-loop -- sai do laço logo em seguida
        await pausar(t)
        return { ...resumo, pausou: true }
      }
      resumo.falhas++
    }
  }
  return resumo
}

async function gravarPessoa(
  pessoaId: string,
  jogos: { appid: number; name?: string | undefined; playtime_forever: number }[] | undefined,
  desejos: { appid: number; priority: number; date_added: number }[] | undefined,
  t: Date,
) {
  await dbBase.$transaction(async (tx) => {
    if (jogos) {
      // RN-STM-06: cache — substitui o conjunto da pessoa
      await tx.jogoPossuido.deleteMany({ where: { pessoaId } })
      await tx.jogoPossuido.createMany({
        data: jogos.map((j) => ({
          pessoaId,
          appId: j.appid,
          minutosJogados: j.playtime_forever,
          sincronizadoEm: t,
        })),
      })
      await tx.steamApp.createMany({
        data: jogos.map((j) => ({ appId: j.appid, nome: j.name ?? null, prioridadeSync: 1 })),
        skipDuplicates: true,
      })
      // o GetOwnedGames já traz o nome: preenche os apps que ainda não tinham (sem esperar o appdetails)
      const comNome = jogos.filter((j) => j.name)
      await tx.$executeRaw`
        UPDATE steam_app s SET nome = v.nome
        FROM unnest(${comNome.map((j) => j.appid)}::int[], ${comNome.map((j) => j.name ?? '')}::text[]) AS v(id, nome)
        WHERE s."appId" = v.id AND s.nome IS NULL`
    }
    // RN-STM-07: {"response":{}} é "vazia" se a biblioteca é pública; se tudo é privado, mantém o
    // último snapshot. Substitui os itens STEAM e mantém os MANUAL, exibidos depois.
    if (desejos || jogos) {
      const ordenados = ordenarListaDesejos(desejos ?? [])
      await tx.itemListaDesejos.deleteMany({ where: { pessoaId, origem: 'STEAM' } })
      await tx.itemListaDesejos.createMany({
        data: ordenados.map((d) => ({
          pessoaId,
          origem: 'STEAM' as const,
          appId: d.appid,
          posicao: d.posicao,
          prioridadeSteam: d.priority,
          adicionadoEm: new Date(d.date_added * 1000),
        })),
      })
      await tx.steamApp.createMany({
        data: ordenados.map((d) => ({ appId: d.appid, prioridadeSync: 2 })),
        skipDuplicates: true,
      })
      await tx.steamApp.updateMany({
        where: { appId: { in: ordenados.map((d) => d.appid) }, prioridadeSync: { lt: 2 } },
        data: { prioridadeSync: 2 },
      })
    }
    await tx.pessoa.update({
      where: { id: pessoaId },
      data: {
        steamSincronizadoEm: t,
        steamJogosPublicos: jogos !== undefined,
        // lista vazia e lista privada respondem igual; só dá para afirmar "privada" com a biblioteca privada
        steamDesejosPublicos: desejos !== undefined || jogos !== undefined,
      },
    })
  })
}

/**
 * RN-STM-08..10: até `limite` apps por execução, por prioridade e antiguidade, com intervalo
 * entre chamadas; 429/403 pausa tudo por 10 min; falha deixa o app para a próxima (vira
 * DESCONHECIDO nas validações, RN-STM-11).
 */
export async function atualizarApps(
  limite = 20,
  api: ApiSteam = apiPadrao(),
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ atualizados: number; pausou: boolean }> {
  const t = agora()
  if (await steamEmPausa(t)) return { atualizados: 0, pausou: true }
  const fila = await db.steamApp.findMany({
    where: {
      OR: [
        { detalhesEm: null },
        { detalhesEm: { lt: new Date(t.getTime() - DETALHES_VALIDOS_MS) } },
        { prioridadeSync: { gte: 2 }, precoEm: { lt: new Date(t.getTime() - PRECO_VALIDO_MS) } },
      ],
    },
    orderBy: [{ prioridadeSync: 'desc' }, { detalhesEm: { sort: 'asc', nulls: 'first' } }],
    take: limite,
    select: { appId: true },
  })
  return buscarDetalhes(
    fila.map((f) => f.appId),
    api,
    esperar,
    t,
  )
}

function capturasDe(lista: readonly { path_thumbnail: string; path_full: string }[]) {
  const pares = lista
    .map((c) => [imagemSteamSegura(c.path_thumbnail), imagemSteamSegura(c.path_full)] as const)
    .filter((p): p is readonly [string, string] => p[0] !== null && p[1] !== null)
    .slice(0, 8)
  return { capturas: pares.map((p) => p[0]), capturasGrandes: pares.map((p) => p[1]) }
}

/** 15 §5: avaliações da loja; falha comum mantém as anteriores, 429/403 pausa (RN-STM-10). */
async function avaliacoesDe(api: ApiSteam, appId: number) {
  try {
    const r = await api.avaliacoes(appId)
    const q = r.success === 1 ? r.query_summary : undefined
    return q
      ? {
          avaliacaoNota: q.review_score,
          avaliacoesPositivas: q.total_positive,
          avaliacoesTotal: q.total_reviews,
        }
      : {}
  } catch (e) {
    if (e instanceof LimiteSteam) throw e
    return {}
  }
}

/**
 * RN-STM-08/10: consulta e grava os detalhes de uma lista de apps, em série e com intervalo;
 * 429/403 pausa tudo. Usado pelo tick e pelo aviso de compra (até 10 apps, cache > 1 h).
 */
export async function buscarDetalhes(
  appIds: readonly number[],
  api: ApiSteam = apiPadrao(),
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  t: Date = agora(),
): Promise<{ atualizados: number; pausou: boolean }> {
  if (await steamEmPausa(t)) return { atualizados: 0, pausou: true }
  let atualizados = 0
  for (const [i, appId] of appIds.entries()) {
    // eslint-disable-next-line no-await-in-loop -- limite de taxa da loja (RN-STM-10): em série, com intervalo
    if (i > 0) await esperar(1_500)
    try {
      // eslint-disable-next-line no-await-in-loop -- idem
      const r = await api.detalhes(appId)
      const d = r?.success ? r.data : undefined
      const dados = d
        ? {
            nome: d.name,
            tipo: d.type,
            gratuito: d.is_free,
            precoFinalCentavos: d.price_overview?.final ?? null,
            precoInicialCentavos: d.price_overview?.initial ?? d.price_overview?.final ?? null,
            descontoPct: d.price_overview?.discount_percent ?? (d.price_overview ? 0 : null),
            generos: (d.genres ?? []).map((g) => g.description).slice(0, 8),
            desenvolvedoras: (d.developers ?? []).slice(0, 4),
            publicadoras: (d.publishers ?? []).slice(0, 4),
            metacritic: d.metacritic?.score ?? null,
            descricaoCurta: d.short_description ? textoSemHtml(d.short_description) : null,
            lancamento: d.release_date?.date ?? null,
            // pares miniatura/grande, descartados juntos se um dos dois não for do CDN (SEG-04)
            ...capturasDe(d.screenshots ?? []),
            categorias: (d.categories ?? []).map((c) => c.id),
            descritoresConteudo: d.content_descriptors?.ids ?? [],
            jogoBaseAppId: d.fullgame?.appid ?? null,
            emBreve: d.release_date?.coming_soon ?? null,
            imagemUrl: imagemSteamSegura(d.header_image),
            sucesso: true,
            detalhesEm: t,
            precoEm: t,
          }
        : { sucesso: false, detalhesEm: t }
      // eslint-disable-next-line no-await-in-loop -- idem
      const notas = d ? await avaliacoesDe(api, appId) : {}
      // eslint-disable-next-line no-await-in-loop -- idem
      const antes = await db.steamApp.findUnique({
        where: { appId },
        select: { precoFinalCentavos: true, descontoPct: true },
      })
      // eslint-disable-next-line no-await-in-loop -- idem
      await db.steamApp.upsert({
        where: { appId },
        create: { appId, ...dados, ...notas },
        update: { ...dados, ...notas },
      })
      // 15 §5: histórico próprio de preço, gravado quando preço ou desconto mudam (CA-191)
      const final = d?.price_overview?.final
      if (
        final !== undefined &&
        (antes?.precoFinalCentavos !== final ||
          antes.descontoPct !== (d?.price_overview?.discount_percent ?? 0))
      ) {
        // eslint-disable-next-line no-await-in-loop -- idem
        await db.precoApp.create({
          data: {
            appId,
            em: t,
            precoCentavos: final,
            descontoPct: d?.price_overview?.discount_percent ?? 0,
          },
        })
      }
      atualizados++
    } catch (e) {
      if (e instanceof LimiteSteam) {
        // eslint-disable-next-line no-await-in-loop -- sai do laço logo em seguida
        await pausar(t)
        return { atualizados, pausou: true }
      }
    }
  }
  return { atualizados, pausou: false }
}

/** Pessoas a sincronizar pelo tick: vínculo de membro aberto ou integrante ativo, > 24 h. */
export async function pessoasVencidas(t: Date): Promise<string[]> {
  const limite = new Date(t.getTime() - 86_400_000)
  const pessoas = await db.pessoa.findMany({
    where: {
      steamId64: { not: null },
      OR: [{ steamSincronizadoEm: null }, { steamSincronizadoEm: { lt: limite } }],
      AND: [
        {
          OR: [
            { membros: { some: { status: { not: 'ENCERRADO' } } } },
            { integrantes: { some: { status: 'ATIVO' } } },
          ],
        },
      ],
    },
    select: { id: true },
  })
  return pessoas.map((p) => p.id)
}

/**
 * RN-FAM-04: amigos Steam (lista pública) com nick e avatar, para indicar e para a área
 * pessoal. Lista privada ou falha mantém o último snapshot.
 */
export async function sincronizarAmigos(pessoaId: string, api: ApiSteam = apiPadrao()) {
  const t = agora()
  if (await steamEmPausa(t)) return
  const p = await dbBase.pessoa.findUnique({ where: { id: pessoaId }, select: { steamId64: true } })
  if (!p?.steamId64) return
  try {
    const { friendslist } = await api.amigos(p.steamId64)
    const ids = friendslist.friends.map((f) => f.steamid)
    const perfis = new Map<string, { nick: string; avatarUrl: string | null }>()
    for (let i = 0; i < ids.length; i += 100) {
      // eslint-disable-next-line no-await-in-loop -- lotes de 100 (RN-STM-05); poucos amigos
      const { response } = await api.resumos(ids.slice(i, i + 100))
      for (const j of response.players) {
        perfis.set(j.steamid, {
          nick: j.personaname.slice(0, 64),
          avatarUrl: imagemSteamSegura(j.avatarfull),
        })
      }
    }
    await dbBase.$transaction([
      dbBase.amizadeSteam.deleteMany({ where: { pessoaId } }),
      dbBase.amizadeSteam.createMany({
        data: friendslist.friends.map((f) => ({
          pessoaId,
          amigoSteamId64: f.steamid,
          desde: f.friend_since ? new Date(f.friend_since * 1000) : null,
          nick: perfis.get(f.steamid)?.nick ?? null,
          avatarUrl: perfis.get(f.steamid)?.avatarUrl ?? null,
          atualizadoEm: t,
        })),
      }),
    ])
  } catch (e) {
    if (e instanceof LimiteSteam) await pausar(t)
    // lista privada (401) ou falha: fica o que havia
  }
}
