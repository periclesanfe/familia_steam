import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { cookies } from 'next/headers'
import { cache } from 'react'

import { registrarEvento } from '../auditoria'
import { db, dbBase } from '../db'
import { cookieSeguro } from '../env'
import { agora } from '../relogio'

/** RN-ACE-05 / 14 SEG-02: `__Host-sessao` com https; `sessao` em http://localhost. */
export const nomeCookieSessao = (): string => (cookieSeguro() ? '__Host-sessao' : 'sessao')

export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex')

export type SessaoAtual = { sessaoId: string; pessoaId: string }

/** Uma consulta por requisição (13 DP-06). Devolve null sem cookie, expirada ou revogada. */
export const obterSessao = cache(async (): Promise<SessaoAtual | null> => {
  const token = (await cookies()).get(nomeCookieSessao())?.value
  if (!token) return null
  const s = await db.sessao.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, pessoaId: true, expiraEm: true, revogadaEm: true },
  })
  if (!s || s.revogadaEm || s.expiraEm <= agora()) return null
  return { sessaoId: s.id, pessoaId: s.pessoaId }
})

const TRINTA_DIAS_S = 30 * 24 * 3600

/** RN-ACE-05: token de 32 bytes, só o sha256 no banco, validade fixa de 30 dias. */
export async function criarSessao(
  pessoaId: string,
  t: Date,
  userAgent: string | null,
): Promise<{ token: string; expiraEm: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiraEm = new Date(t.getTime() + TRINTA_DIAS_S * 1000)
  await dbBase.$transaction(async (tx) => {
    const s = await tx.sessao.create({
      data: {
        tokenHash: hashToken(token),
        pessoaId,
        criadaEm: t,
        expiraEm,
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
      select: { id: true },
    })
    await registrarEvento(
      tx,
      { ator: { tipo: 'MEMBRO', pessoaId }, agora: t },
      {
        acao: 'sessao.criar',
        entidade: 'sessao',
        entidadeId: s.id,
      },
    )
  })
  return { token, expiraEm }
}

/** RN-ACE-05 / SEG-02: Lax (o retorno da Steam é navegação vinda de outro site). */
export const opcoesCookieSessao = () =>
  ({
    httpOnly: true,
    secure: cookieSeguro(),
    sameSite: 'lax',
    path: '/',
    maxAge: TRINTA_DIAS_S,
  }) as const

export async function apagarCookieSessao(): Promise<void> {
  ;(await cookies()).delete(nomeCookieSessao())
}

/** RN-ACE-05: revoga uma sessão (sair) ou todas as da pessoa (sair de todos, REVINCULAR_STEAM). */
export async function revogarSessoes(
  ctx: { ator: { tipo: 'MEMBRO'; pessoaId: string }; agora: Date },
  alvo: { sessaoId: string } | { todasDe: string },
): Promise<number> {
  return dbBase.$transaction(async (tx) => {
    const where =
      'sessaoId' in alvo
        ? { id: alvo.sessaoId, revogadaEm: null }
        : { pessoaId: alvo.todasDe, revogadaEm: null }
    const { count } = await tx.sessao.updateMany({ where, data: { revogadaEm: ctx.agora } })
    await registrarEvento(tx, ctx, {
      acao: 'sessao.revogar',
      entidade: 'sessao',
      entidadeId: 'sessaoId' in alvo ? alvo.sessaoId : alvo.todasDe,
      dados: { depois: { revogadas: count } },
    })
    return count
  })
}
