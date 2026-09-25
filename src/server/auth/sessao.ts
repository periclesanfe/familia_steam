import 'server-only'

import { createHash } from 'node:crypto'

import { cookies } from 'next/headers'
import { cache } from 'react'

import { db } from '../db'
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
