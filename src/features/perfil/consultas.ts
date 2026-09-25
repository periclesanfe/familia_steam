import 'server-only'

import { db } from '@/server/db'

/** /perfil: dados do próprio titular e sessões ativas (RN-ACE-05). */
export async function meuPerfil(pessoaId: string, agora: Date) {
  const [pessoa, sessoes] = await Promise.all([
    db.pessoa.findUniqueOrThrow({
      where: { id: pessoaId },
      select: {
        nome: true,
        apelido: true,
        steamId64: true,
        chavePix: true,
        tipoChavePix: true,
        maioridadeDeclaradaEm: true,
      },
    }),
    db.sessao.findMany({
      where: { pessoaId, revogadaEm: null, expiraEm: { gt: agora } },
      select: { id: true, criadaEm: true, expiraEm: true, userAgent: true },
      orderBy: { criadaEm: 'desc' },
    }),
  ])
  return { pessoa, sessoes }
}
