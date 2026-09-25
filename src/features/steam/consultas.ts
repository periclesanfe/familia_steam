import 'server-only'

import { parametrosSchema, versaoAplicavelSync } from '@/domain/regulamento'
import { codigoAmigo } from '@/domain/regulamento'
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
  categorias: true,
  descritoresConteudo: true,
  imagemUrl: true,
  sucesso: true,
  emBreve: true,
} as const

/** RN-STM-12: união das bibliotecas (membros e integrantes), com donos e cópias; 2 consultas. */
export async function bibliotecaDaFamilia() {
  // 15 §3: JogoPossuido é global; a família vê só os seus integrantes (o RLS filtra a relação)
  const posses = await db.jogoPossuido.findMany({
    where: { pessoa: { integrantes: { some: { status: 'ATIVO' } } } },
    select: { appId: true, minutosJogados: true, pessoa: { select: { id: true, apelido: true } } },
  })
  const apps = await db.steamApp.findMany({
    where: { appId: { in: [...new Set(posses.map((p) => p.appId))] } },
    select: selecaoApp,
  })
  const porApp = new Map(apps.map((a) => [a.appId, a]))
  const agrupado = new Map<number, { donos: { id: string; apelido: string; horas: number }[] }>()
  for (const p of posses) {
    const g = agrupado.get(p.appId) ?? { donos: [] }
    g.donos.push({
      id: p.pessoa.id,
      apelido: p.pessoa.apelido,
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
        imagemUrl: app?.imagemUrl ?? null,
        compartilhavel: compartilhavel(app),
        donos: g.donos.sort((a, b) => a.apelido.localeCompare(b.apelido)),
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
  const apps = new Map(
    (await db.steamApp.findMany({ where: { appId: { in: ids } }, select: selecaoApp })).map((a) => [
      a.appId,
      a,
    ]),
  )
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
        bloqueado: d.appId !== null && bloqueado.has(d.appId),
      }
    }),
  }
}

/** 07 §3.11: jogo — dados da loja, quem possui, quem deseja e bloqueio. */
export async function detalheDoJogo(appId: number) {
  const [app, donos, desejos, bloqueio] = await Promise.all([
    db.steamApp.findUnique({
      where: { appId },
      select: { ...selecaoApp, jogoBaseAppId: true, detalhesEm: true },
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
  ])
  return { appId, app, compartilhavel: compartilhavel(app), donos, desejos, bloqueio }
}
