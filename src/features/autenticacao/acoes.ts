'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { acao } from '@/server/acao'
import { TODOS_OS_PERFIS } from '@/server/auth/guardas'
import { apagarCookieSessao, revogarSessoes } from '@/server/auth/sessao'

const vazio = z.object({})

// RN-ACE-05: sair é POST (Server Action), nunca link GET (14 SEG-03).
export const sairAcao = acao(
  vazio,
  async (_, ctx) => {
    await revogarSessoes(ctx, { sessaoId: ctx.sessaoId })
    await apagarCookieSessao()
    redirect('/entrar')
  },
  { perfis: TODOS_OS_PERFIS },
)

export const sairDeTodosAcao = acao(
  vazio,
  async (_, ctx) => {
    await revogarSessoes(ctx, { todasDe: ctx.ator.pessoaId })
    await apagarCookieSessao()
    redirect('/entrar')
  },
  { perfis: TODOS_OS_PERFIS },
)
