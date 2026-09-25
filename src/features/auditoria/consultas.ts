import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/server/db'

const POR_PAGINA = 50
// RN-ACE-07: o membro lê tudo, menos sessões
const OCULTAS = ['sessao', 'login']

export type FiltroAuditoria = {
  entidade?: string | undefined
  ator?: string | undefined
  acao?: string | undefined
  de?: Date | undefined
  ate?: Date | undefined
  antesDe?: number | undefined
}

/** 07 §3.15: trilha paginada por cursor (id decrescente), filtrável; 3 consultas fixas. */
export async function trilha(f: FiltroAuditoria) {
  const where: Prisma.EventoAuditoriaWhereInput = {
    entidade: f.entidade ? { equals: f.entidade, notIn: OCULTAS } : { notIn: OCULTAS },
    ...(f.ator ? { atorPessoaId: f.ator } : {}),
    ...(f.acao ? { acao: { startsWith: f.acao } } : {}),
    ...(f.de || f.ate
      ? { ocorridoEm: { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lt: f.ate } : {}) } }
      : {}),
    ...(f.antesDe ? { id: { lt: f.antesDe } } : {}),
  }
  const [eventos, entidades, pessoas] = await Promise.all([
    db.eventoAuditoria.findMany({ where, orderBy: { id: 'desc' }, take: POR_PAGINA + 1 }),
    db.eventoAuditoria.findMany({
      where: { entidade: { notIn: OCULTAS } },
      distinct: ['entidade'],
      select: { entidade: true },
      orderBy: { entidade: 'asc' },
    }),
    db.pessoa.findMany({
      where: { membros: { some: {} } },
      select: { id: true, apelido: true },
      orderBy: { apelido: 'asc' },
    }),
  ])
  const pagina = eventos.slice(0, POR_PAGINA)
  const nome = new Map(pessoas.map((p) => [p.id, p.apelido]))
  return {
    eventos: pagina.map((e) => ({
      ...e,
      ator: e.atorPessoaId ? (nome.get(e.atorPessoaId) ?? 'ex-membro') : 'Sistema',
    })),
    proxima: eventos.length > POR_PAGINA ? pagina.at(-1)?.id : undefined,
    entidades: entidades.map((e) => e.entidade),
    pessoas,
  }
}
