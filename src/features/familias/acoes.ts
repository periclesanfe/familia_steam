'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { z } from 'zod'

import { ErroDeNegocio } from '@/domain/erros'
import { sincronizarPessoas } from '@/features/steam/sync'
import { acao } from '@/server/acao'
import { dbBase } from '@/server/db'
import { env } from '@/server/env'
import { criarApiSteam } from '@/server/steam/api'

import {
  aceitarConvite,
  criarFamilia,
  excluirAntesDaVigencia,
  indicar,
  responderIndicacao,
} from './servico'

const NA_FAMILIA = ['MEMBRO', 'PENDENTE'] as const
const dataCivil = z.iso.date('Informe a data')

// RN-FAM-02: só quem não está em família nenhuma.
export const criarFamiliaAcao = acao(
  z.object({
    nome: z.string().trim().min(3, 'Dê um nome à família').max(60),
    entrouNaFamiliaEm: dataCivil,
  }),
  async (e, ctx): Promise<void> => {
    await criarFamilia(ctx, e)
    redirect('/boas-vindas')
  },
  { perfis: ['VISITANTE'] },
)

/** RN-FAM-04: SteamID64, /profiles/<id> ou /id/<nome> (este precisa da Web API). */
async function resolverConta(conta: string): Promise<string> {
  const texto = conta.trim()
  const direto =
    /^(\d{17})$/.exec(texto)?.[1] ??
    /^https?:\/\/steamcommunity\.com\/profiles\/(\d{17})\/?$/.exec(texto)?.[1]
  if (direto) return direto
  const vanity = /^https?:\/\/steamcommunity\.com\/id\/([\w-]{2,32})\/?$/.exec(texto)?.[1]
  if (vanity && env().STEAM_API_KEY) {
    const { response } = await criarApiSteam(env().STEAM_API_KEY).resolverVanity(vanity)
    if (response.success === 1 && response.steamid) return response.steamid
  }
  throw new ErroDeNegocio('ENTRADA_INVALIDA', 'Não encontrei essa conta Steam.')
}

/** Nick do candidato pela Steam (sem key, fica o apelido provisório). */
async function nickDe(steamId64: string): Promise<string> {
  const conhecida = await dbBase.pessoa.findUnique({
    where: { steamId64 },
    select: { steamNick: true, apelido: true },
  })
  if (conhecida) return conhecida.steamNick ?? conhecida.apelido
  if (!env().STEAM_API_KEY) return `Jogador ${steamId64.slice(-4)}`
  try {
    const { response } = await criarApiSteam(env().STEAM_API_KEY).resumos([steamId64])
    return response.players[0]?.personaname.slice(0, 64) ?? `Jogador ${steamId64.slice(-4)}`
  } catch {
    return `Jogador ${steamId64.slice(-4)}`
  }
}

// RN-FAM-04/05: indicar um amigo Steam ou um perfil colado; o e-mail é só para o convite.
export const indicarAcao = acao(
  z.object({
    conta: z.string().trim().min(3, 'Cole o link do perfil Steam ou o SteamID64'),
    email: z.email('E-mail inválido').optional(),
  }),
  async (e, ctx) => {
    const steamId64 = await resolverConta(e.conta)
    const r = await indicar(ctx, { steamId64, email: e.email, nome: await nickDe(steamId64) })
    // a biblioteca do candidato aparece para a decisão depois da sincronização
    after(async () => {
      const p = await dbBase.pessoa.findUnique({ where: { steamId64 }, select: { id: true } })
      if (p && env().STEAM_API_KEY) await sincronizarPessoas([p.id])
    })
    return r
  },
  { perfis: NA_FAMILIA },
)

export const responderIndicacaoAcao = acao(
  z.object({ indicacaoId: z.uuid(), resposta: z.enum(['aprovo', 'recuso']) }),
  (e, ctx) =>
    responderIndicacao(ctx, { indicacaoId: e.indicacaoId, aprova: e.resposta === 'aprovo' }),
  { perfis: NA_FAMILIA },
)

// RN-FAM-06: o candidato aceita com a própria conta Steam.
export const aceitarConviteAcao = acao(
  z.object({
    token: z.string().min(10),
    jaNaFamilia: z.literal('on').optional(),
    naFamiliaSteamDesde: dataCivil.optional(),
  }),
  async (e, ctx): Promise<void> => {
    await aceitarConvite(ctx, {
      token: e.token,
      naFamiliaSteamDesde: e.jaNaFamilia ? e.naFamiliaSteamDesde : undefined,
    })
    redirect('/boas-vindas')
  },
  { perfis: ['VISITANTE', 'EX_COM_PENDENCIA'] },
)

// RN-FAM-10 (D-37): o organizador exclui antes da vigência.
export const excluirDaFamiliaAcao = acao(
  z.object({ pessoaId: z.uuid() }),
  (e, ctx) => excluirAntesDaVigencia(ctx, e),
  { perfis: NA_FAMILIA },
)
