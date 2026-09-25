import 'server-only'

import { parametrosSchema, versaoAplicavelSync } from '@/domain/regulamento'
import { codigoAmigo } from '@/domain/regulamento'
import { avaliacaoDaLoja, capaDoApp } from '@/domain/steam'
import { dataLocal, deDb } from '@/domain/tempo'
import { db } from '@/server/db'

export type Compartilhavel = 'SIM' | 'NAO' | 'VERIFICANDO'

/** RN-STM-12: categoria 62 = Family Sharing; sem detalhes da loja ainda → "verificando". */
export const compartilhavel = (
  app: { sucesso: boolean | null; categorias: number[] } | null,
): Compartilhavel => (!app?.sucesso ? 'VERIFICANDO' : app.categorias.includes(62) ? 'SIM' : 'NAO')

const selecaoApp = {
  appId: true,
  nome: true,
  tipo: true,
  gratuito: true,
  precoFinalCentavos: true,
  precoInicialCentavos: true,
  descontoPct: true,
  generos: true,
  metacritic: true,
  categorias: true,
  descritoresConteudo: true,
  imagemUrl: true,
  sucesso: true,
  emBreve: true,
  avaliacaoNota: true,
  avaliacoesPositivas: true,
  avaliacoesTotal: true,
} as const

/** RN-STM-12: união das bibliotecas (membros e integrantes), com donos e cópias; 2 consultas. */
export async function bibliotecaDaFamilia() {
  // 15 §3: JogoPossuido é global; a família vê só os seus integrantes (o RLS filtra a relação)
  const posses = await db.jogoPossuido.findMany({
    where: {
      pessoa: { OR: [{ integrantes: { some: { status: 'ATIVO' } } }, { membros: { some: {} } }] },
    },
    select: {
      appId: true,
      minutosJogados: true,
      pessoa: { select: { id: true, apelido: true, steamNick: true, steamAvatarUrl: true } },
    },
  })
  const apps = await db.steamApp.findMany({
    where: { appId: { in: [...new Set(posses.map((p) => p.appId))] } },
    select: selecaoApp,
  })
  const porApp = new Map(apps.map((a) => [a.appId, a]))
  type Dono = { id: string; apelido: string; avatarUrl: string | null; horas: number }
  const agrupado = new Map<number, { donos: Dono[] }>()
  for (const p of posses) {
    const g = agrupado.get(p.appId) ?? { donos: [] }
    g.donos.push({
      id: p.pessoa.id,
      apelido: p.pessoa.steamNick ?? p.pessoa.apelido,
      avatarUrl: p.pessoa.steamAvatarUrl,
      horas: Math.round(p.minutosJogados / 60),
    })
    agrupado.set(p.appId, g)
  }
  return [...agrupado.entries()]
    .map(([appId, g]) => {
      const app = porApp.get(appId) ?? null
      return {
        appId,
        nome: app?.nome ?? `App ${String(appId)}`,
        imagemUrl: app?.imagemUrl ?? capaDoApp(appId),
        compartilhavel: compartilhavel(app),
        tipo: app?.tipo ?? null,
        generos: app?.generos ?? [],
        avaliacao: app ? avaliacaoDaLoja(app) : null,
        horas: g.donos.reduce((s, d) => s + d.horas, 0),
        donos: g.donos.sort((a, b) => b.horas - a.horas),
        copias: g.donos.length,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** 07 §3.10: integrantes (membros e não membros) e vagas (RN-CAD-11). */
export async function familia(agora: Date) {
  const [integrantes, versoes] = await Promise.all([
    db.integranteFamilia.findMany({
      select: {
        id: true,
        status: true,
        origem: true,
        entrouEm: true,
        saiuEm: true,
        vagaBloqueadaAte: true,
        pessoa: {
          select: {
            id: true,
            apelido: true,
            steamNick: true,
            membros: { where: { status: { not: 'ENCERRADO' } }, select: { status: true } },
          },
        },
      },
      orderBy: { criadoEm: 'asc' },
    }),
    db.versaoRegulamento.findMany({
      select: { ordem: true, vigenteDesde: true, parametros: true },
    }),
  ])
  const hoje = dataLocal(agora)
  const capacidade = parametrosSchema.parse(
    versaoAplicavelSync(versoes, agora)?.parametros ?? {},
  ).capacidadeFamilia
  const ativos = integrantes.filter((i) => i.status === 'ATIVO').length
  const bloqueadas = integrantes.filter(
    (i) => i.vagaBloqueadaAte && deDb(i.vagaBloqueadaAte) > hoje,
  )
  return {
    integrantes: integrantes.map((i) => ({
      id: i.id,
      pessoaId: i.pessoa.id,
      apelido: i.pessoa.apelido,
      steamNick: i.pessoa.steamNick,
      membro: i.pessoa.membros.length > 0,
      status: i.status,
      origem: i.origem,
      entrouEm: i.entrouEm ? deDb(i.entrouEm) : null,
    })),
    vagas: {
      capacidade,
      ocupadas: ativos,
      bloqueadas: bloqueadas.flatMap((i) =>
        i.vagaBloqueadaAte ? [{ apelido: i.pessoa.apelido, ate: deDb(i.vagaBloqueadaAte) }] : [],
      ),
      livres: capacidade - ativos - bloqueadas.length,
    },
  }
}

/** 07 §1 /membros: membros e ex-membros com o estado da Steam. */
export const listarMembros = () =>
  db.pessoa.findMany({
    where: { membros: { some: {} } },
    select: {
      id: true,
      apelido: true,
      steamNick: true,
      steamAvatarUrl: true,
      steamSincronizadoEm: true,
      steamJogosPublicos: true,
      membros: { orderBy: { criadoEm: 'desc' }, take: 1, select: { status: true } },
      _count: { select: { jogos: true } },
    },
    orderBy: { apelido: 'asc' },
  })

/** 07 §3.11: perfil público do membro — jogos e lista de desejos com preço e bloqueio. */
export async function perfilDoMembro(pessoaId: string) {
  const [pessoa, jogos, desejos, bloqueados] = await Promise.all([
    db.pessoa.findUnique({
      where: { id: pessoaId },
      select: {
        id: true,
        apelido: true,
        steamId64: true,
        steamNick: true,
        steamAvatarUrl: true,
        steamPerfilUrl: true,
        steamPerfilPublico: true,
        steamJogosPublicos: true,
        steamDesejosPublicos: true,
        steamSincronizadoEm: true,
        membros: { orderBy: { criadoEm: 'desc' }, take: 1, select: { status: true } },
      },
    }),
    db.jogoPossuido.findMany({
      where: { pessoaId },
      select: { appId: true, minutosJogados: true },
    }),
    db.itemListaDesejos.findMany({
      where: { pessoaId },
      orderBy: [{ origem: 'desc' }, { posicao: 'asc' }], // STEAM antes de MANUAL (RN-COM-01)
      select: {
        id: true,
        origem: true,
        appId: true,
        tituloLivre: true,
        posicao: true,
        adicionadoEm: true,
      },
    }),
    db.jogoBloqueado.findMany({
      where: { excluidoEm: null, tipo: 'JOGO' },
      select: { appIds: true },
    }),
  ])
  if (!pessoa) return null
  const ids = [
    ...new Set([
      ...jogos.map((j) => j.appId),
      ...desejos.flatMap((d) => (d.appId ? [d.appId] : [])),
    ]),
  ]
  const [listaApps, minimos] = await Promise.all([
    db.steamApp.findMany({ where: { appId: { in: ids } }, select: selecaoApp }),
    db.precoApp.groupBy({
      by: ['appId'],
      where: { appId: { in: desejos.flatMap((d) => (d.appId ? [d.appId] : [])) } },
      _min: { precoCentavos: true },
    }),
  ])
  const apps = new Map(listaApps.map((a) => [a.appId, a]))
  const menor = new Map(minimos.map((m) => [m.appId, m._min.precoCentavos]))
  const bloqueado = new Set(bloqueados.flatMap((b) => b.appIds))
  return {
    pessoa: { ...pessoa, codigoAmigo: pessoa.steamId64 ? codigoAmigo(pessoa.steamId64) : null },
    jogos: jogos
      .map((j) => {
        const a = apps.get(j.appId) ?? null
        return {
          appId: j.appId,
          nome: a?.nome ?? `App ${String(j.appId)}`,
          horas: Math.round(j.minutosJogados / 60),
          compartilhavel: compartilhavel(a),
        }
      })
      .sort((x, y) => y.horas - x.horas),
    desejos: desejos.map((d) => {
      const a = d.appId ? (apps.get(d.appId) ?? null) : null
      return {
        ...d,
        nome: a?.nome ?? d.tituloLivre ?? `App ${String(d.appId)}`,
        precoCentavos: a?.precoFinalCentavos ?? null,
        precoInicialCentavos: a?.precoInicialCentavos ?? null,
        descontoPct: a?.descontoPct ?? null,
        menorPrecoCentavos: d.appId ? (menor.get(d.appId) ?? null) : null,
        gratuito: a?.gratuito ?? null,
        generos: a?.generos ?? [],
        metacritic: a?.metacritic ?? null,
        avaliacao: a ? avaliacaoDaLoja(a) : null,
        emBreve: a?.emBreve ?? null,
        compartilhavel: compartilhavel(a),
        imagemUrl: a?.imagemUrl ?? (d.appId ? capaDoApp(d.appId) : null),
        bloqueado: d.appId !== null && bloqueado.has(d.appId),
      }
    }),
  }
}

/** 07 §3.11: jogo — dados da loja, quem possui, quem deseja e bloqueio. */
export async function detalheDoJogo(appId: number) {
  const [app, donos, desejos, bloqueio, precos] = await Promise.all([
    db.steamApp.findUnique({
      where: { appId },
      select: {
        ...selecaoApp,
        jogoBaseAppId: true,
        detalhesEm: true,
        descricaoCurta: true,
        lancamento: true,
        desenvolvedoras: true,
        publicadoras: true,
        capturas: true,
        capturasGrandes: true,
      },
    }),
    db.jogoPossuido.findMany({
      where: { appId, pessoa: { OR: [{ integrantes: { some: {} } }, { membros: { some: {} } }] } },
      select: { minutosJogados: true, pessoa: { select: { id: true, apelido: true } } },
    }),
    db.itemListaDesejos.findMany({
      where: { appId, pessoa: { OR: [{ integrantes: { some: {} } }, { membros: { some: {} } }] } },
      select: { posicao: true, origem: true, pessoa: { select: { id: true, apelido: true } } },
    }),
    db.jogoBloqueado.findFirst({
      where: { appIds: { has: appId }, excluidoEm: null },
      select: { numero: true, motivo: true, ataInclusaoNumero: true },
    }),
    // 15 §5: menor preço visto e desde quando o sistema observa
    db.precoApp.aggregate({ where: { appId }, _min: { precoCentavos: true, em: true } }),
  ])
  return {
    appId,
    app,
    compartilhavel: compartilhavel(app),
    avaliacao: app ? avaliacaoDaLoja(app) : null,
    menorPrecoCentavos: precos._min.precoCentavos,
    precosDesde: precos._min.em,
    donos,
    desejos,
    bloqueio,
  }
}
