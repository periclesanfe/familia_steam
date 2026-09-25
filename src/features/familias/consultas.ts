import 'server-only'

import { capaDoApp } from '@/domain/steam'
import { db, dbBase } from '@/server/db'

const nomeDe = (p: { steamNick: string | null; apelido: string }) => p.steamNick ?? p.apelido

/**
 * 15 §1: a área pessoal (/inicio) — perfil Steam, família, convites recebidos, amigos e o
 * resumo de jogos e lista de desejos. Dados globais: não dependem de família (dbBase).
 */
export async function minhaArea(pessoaId: string, agora: Date) {
  const pessoa = await dbBase.pessoa.findUniqueOrThrow({
    where: { id: pessoaId },
    select: {
      apelido: true,
      steamNick: true,
      steamAvatarUrl: true,
      steamPerfilUrl: true,
      steamId64: true,
      steamJogosPublicos: true,
      steamSincronizadoEm: true,
      familiaId: true,
    },
  })
  const [convites, amigos, jogos, desejos, familia] = await Promise.all([
    pessoa.steamId64
      ? dbBase.convite.findMany({
          where: { steamId64: pessoa.steamId64, usadoEm: null, expiraEm: { gt: agora } },
          select: { token: true, familiaId: true, expiraEm: true },
        })
      : [],
    dbBase.amizadeSteam.findMany({
      where: { pessoaId },
      orderBy: { nick: 'asc' },
      select: { amigoSteamId64: true, nick: true, avatarUrl: true, desde: true },
    }),
    dbBase.jogoPossuido.count({ where: { pessoaId } }),
    dbBase.itemListaDesejos.findMany({
      where: { pessoaId },
      orderBy: { posicao: 'asc' },
      take: 12,
      select: { id: true, appId: true, tituloLivre: true },
    }),
    pessoa.familiaId
      ? dbBase.familia.findUnique({ where: { id: pessoa.familiaId }, select: { nome: true } })
      : null,
  ])
  const [familias, noSistema, apps] = await Promise.all([
    dbBase.familia.findMany({
      where: { id: { in: convites.map((c) => c.familiaId) } },
      select: { id: true, nome: true },
    }),
    dbBase.pessoa.findMany({
      where: { steamId64: { in: amigos.map((a) => a.amigoSteamId64) } },
      select: { id: true, steamId64: true, familiaId: true },
    }),
    dbBase.steamApp.findMany({
      where: { appId: { in: desejos.flatMap((d) => (d.appId ? [d.appId] : [])) } },
      select: { appId: true, nome: true, imagemUrl: true },
    }),
  ])
  return {
    pessoa: { ...pessoa, nome: nomeDe(pessoa) },
    familia: familia?.nome ?? null,
    convites: convites.map((c) => ({
      ...c,
      familia: familias.find((f) => f.id === c.familiaId)?.nome ?? 'Família',
    })),
    amigos: amigos.map((a) => {
      const p = noSistema.find((x) => x.steamId64 === a.amigoSteamId64)
      return {
        ...a,
        noSistema: !!p,
        naMinhaFamilia: !!p?.familiaId && p.familiaId === pessoa.familiaId,
      }
    }),
    totalJogos: jogos,
    desejos: desejos.map((d) => {
      const app = apps.find((a) => a.appId === d.appId)
      return {
        ...d,
        nome: app?.nome ?? d.tituloLivre ?? `App ${String(d.appId)}`,
        imagemUrl: app?.imagemUrl ?? (d.appId ? capaDoApp(d.appId) : null),
      }
    }),
  }
}

/**
 * RN-FAM-04/05 (dentro da família, RLS): indicações abertas e aprovadas com convite ainda não
 * usado, com o que cada candidato acrescenta à biblioteca da família.
 */
export async function indicacoesDaFamilia(pessoaId: string, agora: Date) {
  const [indicacoes, membros, integrantes] = await Promise.all([
    db.indicacao.findMany({
      where: {
        OR: [{ status: 'ABERTA', expiraEm: { gt: agora } }, { status: 'APROVADA' }],
      },
      orderBy: { criadaEm: 'desc' },
      include: { aprovacoes: true },
    }),
    db.membro.findMany({
      where: { status: { not: 'ENCERRADO' } },
      select: { pessoaId: true, pessoa: { select: { apelido: true } } },
    }),
    db.integranteFamilia.findMany({ where: { status: 'ATIVO' }, select: { pessoaId: true } }),
  ])
  const [candidatos, convites, jogosFamilia, jogosCandidatos] = await Promise.all([
    dbBase.pessoa.findMany({
      where: { id: { in: indicacoes.map((i) => i.candidatoId) } },
      select: {
        id: true,
        apelido: true,
        steamNick: true,
        steamAvatarUrl: true,
        steamPerfilUrl: true,
        steamJogosPublicos: true,
      },
    }),
    dbBase.convite.findMany({
      where: { indicacaoId: { in: indicacoes.map((i) => i.id) }, usadoEm: null },
      select: { indicacaoId: true, token: true, expiraEm: true },
    }),
    dbBase.jogoPossuido.findMany({
      where: { pessoaId: { in: integrantes.map((i) => i.pessoaId) } },
      select: { appId: true },
    }),
    dbBase.jogoPossuido.findMany({
      where: { pessoaId: { in: indicacoes.map((i) => i.candidatoId) } },
      select: { pessoaId: true, appId: true },
    }),
  ])
  const compartilhaveis = new Set(
    (
      await dbBase.steamApp.findMany({
        where: {
          appId: { in: [...new Set(jogosCandidatos.map((j) => j.appId))] },
          categorias: { has: 62 },
        },
        select: { appId: true },
      })
    ).map((a) => a.appId),
  )
  const daFamilia = new Set(jogosFamilia.map((j) => j.appId))
  const nome = (id: string) => membros.find((m) => m.pessoaId === id)?.pessoa.apelido ?? '—'
  return indicacoes
    .filter((i) => i.status === 'ABERTA' || convites.some((c) => c.indicacaoId === i.id))
    .map((i) => {
      const c = candidatos.find((p) => p.id === i.candidatoId)
      const jogos = jogosCandidatos.filter((j) => j.pessoaId === i.candidatoId)
      const novos = jogos.filter((j) => !daFamilia.has(j.appId))
      const convite = convites.find((x) => x.indicacaoId === i.id)
      return {
        id: i.id,
        status: i.status,
        votacaoId: i.votacaoId,
        email: i.email,
        expiraEm: i.expiraEm,
        indicadaPor: nome(i.indicadaPorId),
        candidato: {
          nome: c ? nomeDe(c) : i.candidatoSteamId64,
          avatarUrl: c?.steamAvatarUrl ?? null,
          perfilUrl: c?.steamPerfilUrl ?? null,
          bibliotecaPublica: c?.steamJogosPublicos ?? null,
          jogos: jogos.length,
          novos: novos.length,
          novosCompartilhaveis: novos.filter((j) => compartilhaveis.has(j.appId)).length,
        },
        aprovacoes: membros.map((m) => ({
          nome: m.pessoa.apelido,
          resposta: i.aprovacoes.find((a) => a.pessoaId === m.pessoaId)?.aprova ?? null,
        })),
        minhaResposta: i.aprovacoes.find((a) => a.pessoaId === pessoaId)?.aprova ?? null,
        convite: convite ?? null,
      }
    })
}

/** Nome da família atual da pessoa (tabela global). */
export async function familiaDe(pessoaId: string): Promise<string | null> {
  const p = await dbBase.pessoa.findUnique({ where: { id: pessoaId }, select: { familiaId: true } })
  if (!p?.familiaId) return null
  const f = await dbBase.familia.findUnique({ where: { id: p.familiaId }, select: { nome: true } })
  return f?.nome ?? null
}

/** Membros da família da pessoa (RLS) com a situação de cada um, para o card do Início. */
export async function membrosDaMinhaFamilia() {
  const [membros, versao] = await Promise.all([
    db.membro.findMany({
      where: { status: { not: 'ENCERRADO' } },
      select: {
        status: true,
        pessoa: {
          select: {
            id: true,
            apelido: true,
            steamNick: true,
            steamAvatarUrl: true,
            adesoes: { select: { id: true }, take: 1 },
          },
        },
      },
      orderBy: { pessoa: { apelido: 'asc' } },
    }),
    db.versaoRegulamento.findFirst({
      where: { vigenteDesde: { not: null } },
      select: { id: true },
    }),
  ])
  return {
    emVigor: versao !== null,
    membros: membros.map((m) => ({
      id: m.pessoa.id,
      nome: m.pessoa.steamNick ?? m.pessoa.apelido,
      avatarUrl: m.pessoa.steamAvatarUrl,
      assinou: m.pessoa.adesoes.length > 0,
      status: m.status,
    })),
  }
}
