import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import { registrarEvento } from '@/server/auditoria'
import { type Perfil, perfilDe } from '@/server/auth/perfil'
import { criarSessao } from '@/server/auth/sessao'
import { db } from '@/server/db'
import { log } from '@/server/log'

export type ResultadoEntrada =
  | { tipo: 'OK'; token: string; perfil: Perfil; pessoaId: string }
  | { tipo: 'REPLAY' }
  | { tipo: 'NAO_AUTORIZADO' }

/**
 * Depois do OpenID validado (RN-STM-01 itens 1–9): anti-replay do nonce, lista de SteamIDs
 * (RN-ACE-04) e sessão. Entra quem tem vínculo de membro, aberto ou encerrado (EX_*).
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

  const pessoa = await db.pessoa.findUnique({
    where: { steamId64: e.steamId64 },
    select: { id: true, _count: { select: { membros: true } } },
  })
  if (!pessoa || pessoa._count.membros === 0) {
    // resposta válida da Steam, conta fora da lista: única falha que vai para a trilha oficial
    await db.$transaction((tx) =>
      registrarEvento(
        tx,
        { ator: { tipo: 'SISTEMA' }, agora: e.agora },
        {
          acao: 'auth.nao_autorizado',
          entidade: 'login',
          entidadeId: e.steamId64,
        },
      ),
    )
    return { tipo: 'NAO_AUTORIZADO' }
  }

  const perfil = await perfilDe(pessoa.id)
  if (!perfil) return { tipo: 'NAO_AUTORIZADO' }
  const { token } = await criarSessao(pessoa.id, e.agora, e.userAgent)
  return { tipo: 'OK', token, perfil: perfil.perfil, pessoaId: pessoa.id }
}
