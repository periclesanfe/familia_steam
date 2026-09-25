import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import { type Perfil, perfilDe } from '@/server/auth/perfil'
import { criarSessao } from '@/server/auth/sessao'
import { db, dbBase } from '@/server/db'
import { log } from '@/server/log'

export type ResultadoEntrada =
  | { tipo: 'OK'; token: string; perfil: Perfil; pessoaId: string }
  | { tipo: 'REPLAY' }
  | { tipo: 'NAO_AUTORIZADO' }

/**
 * Depois do OpenID validado (RN-STM-01 itens 1–9): anti-replay do nonce e sessão. Qualquer
 * conta Steam entra (RN-FAM-01); o que ela vê depende do perfil derivado.
 */
export async function entrarComSteam(e: {
  steamId64: string
  nonce: string
  userAgent: string | null
  agora: Date
}): Promise<ResultadoEntrada> {
  try {
    await db.nonceOpenId.create({ data: { nonce: e.nonce, usadoEm: e.agora } })
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      log.aviso('auth.falha', { motivo: 'REPLAY' })
      return { tipo: 'REPLAY' }
    }
    throw erro
  }

  // RN-FAM-01: toda conta Steam válida entra; a desconhecida vira VISITANTE (o nick e o avatar
  // chegam na sincronização logo depois do login)
  const pessoa =
    (await dbBase.pessoa.findUnique({ where: { steamId64: e.steamId64 }, select: { id: true } })) ??
    (await dbBase.pessoa.create({
      data: { steamId64: e.steamId64, apelido: `Jogador ${e.steamId64.slice(-4)}` },
      select: { id: true },
    }))

  const perfil = await perfilDe(pessoa.id)
  if (!perfil) return { tipo: 'NAO_AUTORIZADO' }
  const { token } = await criarSessao(pessoa.id, e.agora, e.userAgent)
  return { tipo: 'OK', token, perfil: perfil.perfil, pessoaId: pessoa.id }
}
