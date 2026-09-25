import 'server-only'

import { imagemSteamSegura, ordenarListaDesejos } from '@/domain/steam'
import { db } from '@/server/db'
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
 * transação; gravação curta por pessoa depois (13 DP-08/DP-13). Integrante que não é membro
 * sincroniza perfil e biblioteca, sem lista de desejos.
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
    select: {
      id: true,
      steamId64: true,
      membros: { where: { status: { not: 'ENCERRADO' } }, select: { id: true } },
    },
  })
  const comSteam = pessoas.flatMap((p) => (p.steamId64 ? [{ ...p, steamId64: p.steamId64 }] : []))
  if (comSteam.length === 0) return resumo

  try {
    // RN-STM-05: uma chamada para todos (até 100)
    const { response } = await api.resumos(comSteam.map((p) => p.steamId64))
    await db.$transaction(
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
      const membro = p.membros.length > 0
      // eslint-disable-next-line no-await-in-loop -- idem
      const desejos = membro ? await api.listaDesejos(p.steamId64) : null
      // eslint-disable-next-line no-await-in-loop -- gravação curta por pessoa, depois das chamadas
      await gravarPessoa(p.id, jogos.response.games, desejos?.response.items, membro, t)
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
  jogos: { appid: number; playtime_forever: number }[] | undefined,
  desejos: { appid: number; priority: number; date_added: number }[] | undefined,
  membro: boolean,
  t: Date,
) {
  await db.$transaction(async (tx) => {
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
        data: jogos.map((j) => ({ appId: j.appid, prioridadeSync: 1 })),
        skipDuplicates: true,
      })
    }
    // RN-STM-07: {"response":{}} é "vazia" se a biblioteca é pública; se tudo é privado, mantém o
    // último snapshot. Substitui os itens STEAM e mantém os MANUAL, exibidos depois.
    if (membro && (desejos || jogos)) {
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
        steamDesejosPublicos: membro ? desejos !== undefined || jogos !== undefined : null,
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
  let atualizados = 0
  for (const [i, { appId }] of fila.entries()) {
    // eslint-disable-next-line no-await-in-loop -- limite de taxa da loja (RN-STM-10): em série, com intervalo
    if (i > 0) await esperar(1_500)
    try {
      // eslint-disable-next-line no-await-in-loop -- idem
      const r = await api.detalhes(appId)
      const d = r?.success ? r.data : undefined
      // eslint-disable-next-line no-await-in-loop -- idem
      await db.steamApp.update({
        where: { appId },
        data: d
          ? {
              nome: d.name,
              tipo: d.type,
              gratuito: d.is_free,
              precoFinalCentavos: d.price_overview?.final ?? null,
              categorias: (d.categories ?? []).map((c) => c.id),
              descritoresConteudo: d.content_descriptors?.ids ?? [],
              jogoBaseAppId: d.fullgame?.appid ?? null,
              emBreve: d.release_date?.coming_soon ?? null,
              imagemUrl: imagemSteamSegura(d.header_image),
              sucesso: true,
              detalhesEm: t,
              precoEm: t,
            }
          : { sucesso: false, detalhesEm: t },
      })
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
