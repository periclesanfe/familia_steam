import 'server-only'

import { cruzarJanelas, sorteiosPrevistos } from '@/domain/promocoes'
import { parametrosSchema, versaoAplicavelSync } from '@/domain/regulamento'
import { capaDoApp } from '@/domain/steam'
import { dataLocal, deDb, paraDb } from '@/domain/tempo'
import { db, dbBase } from '@/server/db'

const MESES = 6

/**
 * 15 §6: eventos globais que ainda não acabaram, os próximos sorteios da família com a janela de
 * compra de cada um e os itens das listas de desejos da família em promoção agora.
 */
export async function calendarioDePromocoes(agora: Date) {
  const hoje = dataLocal(agora)
  const [eventos, versoes, desejos] = await Promise.all([
    dbBase.eventoPromocao.findMany({
      where: { fim: { gte: paraDb(hoje) } },
      orderBy: { inicio: 'asc' },
    }),
    db.versaoRegulamento.findMany({
      select: { ordem: true, vigenteDesde: true, parametros: true },
    }),
    // RLS: `membros` só enxerga a família atual
    db.itemListaDesejos.findMany({
      where: {
        appId: { not: null },
        pessoa: { membros: { some: { status: { not: 'ENCERRADO' } } } },
      },
      select: { appId: true, pessoa: { select: { apelido: true, steamNick: true } } },
    }),
  ])
  const apps = await dbBase.steamApp.findMany({
    where: {
      appId: { in: [...new Set(desejos.map((d) => d.appId ?? 0))] },
      descontoPct: { gt: 0 },
    },
    select: {
      appId: true,
      nome: true,
      imagemUrl: true,
      precoFinalCentavos: true,
      precoInicialCentavos: true,
      descontoPct: true,
    },
  })
  const civis = eventos.map((e) => ({ ...e, inicio: deDb(e.inicio), fim: deDb(e.fim) }))
  const versao = versaoAplicavelSync(versoes, agora)
  const p = versao ? parametrosSchema.parse(versao.parametros) : null
  return {
    hoje,
    eventos: civis,
    janelas: p
      ? cruzarJanelas(sorteiosPrevistos(hoje, p.diaSorteio, MESES), p.diasPrazoCompra, civis)
      : [],
    emPromocao: apps
      .map((a) => ({
        ...a,
        imagemUrl: a.imagemUrl ?? capaDoApp(a.appId),
        querem: [
          ...new Set(
            desejos
              .filter((d) => d.appId === a.appId)
              .map((d) => d.pessoa.steamNick ?? d.pessoa.apelido),
          ),
        ],
      }))
      .sort((a, b) => (b.descontoPct ?? 0) - (a.descontoPct ?? 0)),
  }
}
