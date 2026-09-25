'use server'

import { z } from 'zod'

import { acao } from '@/server/acao'
import { TODOS_OS_PERFIS } from '@/server/auth/guardas'

import { adicionarDesejo, moverDesejo, removerDesejo, sincronizarAgora } from './servico'

export const sincronizarAgoraAcao = acao(z.object({}), (_, ctx) => sincronizarAgora(ctx), {
  perfis: TODOS_OS_PERFIS,
})

export const adicionarDesejoAcao = acao(
  z.object({ texto: z.string().trim().min(1, 'Cole o link da loja, o appId ou o nome').max(200) }),
  (e, ctx) => adicionarDesejo(ctx, e),
  { perfis: TODOS_OS_PERFIS },
)

export const removerDesejoAcao = acao(
  z.object({ itemId: z.uuid() }),
  (e, ctx) => removerDesejo(ctx, e),
  { perfis: TODOS_OS_PERFIS },
)

export const moverDesejoAcao = acao(
  z.object({ itemId: z.uuid(), direcao: z.enum(['cima', 'baixo']) }),
  (e, ctx) => moverDesejo(ctx, e),
  { perfis: TODOS_OS_PERFIS },
)
