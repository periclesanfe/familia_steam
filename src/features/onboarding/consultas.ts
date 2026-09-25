import 'server-only'

import { adesaoValida, codigoAmigo } from '@/domain/regulamento'
import { deDb } from '@/domain/tempo'
import { anexoI, progressoDasAssinaturas, versaoAplicavel } from '@/features/regulamento/consultas'
import { db } from '@/server/db'

/** Tudo que a tela /boas-vindas mostra, em número fixo de consultas (13 DP-02). */
export async function estadoDoOnboarding(pessoaId: string, agora: Date) {
  const [pessoa, versao, bloqueados, ciclo1] = await Promise.all([
    db.pessoa.findUniqueOrThrow({
      where: { id: pessoaId },
      select: {
        nome: true,
        apelido: true,
        steamId64: true,
        steamNick: true,
        steamAvatarUrl: true,
        chavePix: true,
        tipoChavePix: true,
        maioridadeDeclaradaEm: true,
        adesoes: {
          select: { versaoId: true, sha256Versao: true, codigoAmigo: true, assinadaEm: true },
        },
      },
    }),
    versaoAplicavel(agora),
    anexoI(),
    db.ciclo.findUnique({ where: { numero: 1 }, select: { dataInicio: true } }),
  ])
  const assinatura =
    versao &&
    pessoa.adesoes.find(
      (a) =>
        a.versaoId === versao.id && adesaoValida(a, versao, { steamId64: pessoa.steamId64 ?? '' }),
    )
  const progresso = versao ? await progressoDasAssinaturas(versao) : null
  return {
    pessoa: {
      nome: pessoa.nome,
      apelido: pessoa.apelido,
      steamId64: pessoa.steamId64,
      steamNick: pessoa.steamNick,
      steamAvatarUrl: pessoa.steamAvatarUrl,
      chavePix: pessoa.chavePix,
      tipoChavePix: pessoa.tipoChavePix,
      maioridadeDeclaradaEm: pessoa.maioridadeDeclaradaEm,
      codigoAmigo: pessoa.steamId64 ? codigoAmigo(pessoa.steamId64) : null,
      cadastroCompleto: Boolean(pessoa.nome && pessoa.chavePix && pessoa.maioridadeDeclaradaEm),
    },
    versao,
    bloqueados,
    assinadaEm: assinatura ? assinatura.assinadaEm : null,
    progresso,
    inicioDoCiclo1: ciclo1 ? deDb(ciclo1.dataInicio) : null,
  }
}
