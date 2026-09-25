import 'server-only'

import { aquisicaoAtiva } from '@/domain/compra'
import { gasto, premio, ratear, sobra } from '@/domain/financeiro'
import { dataLocal, deDb, fimDoDia } from '@/domain/tempo'
import type { MotivoFechamento } from '@/generated/prisma/enums'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import { db, type Tx } from '@/server/db'
import { emTransacao, travar } from '@/server/tx'

/**
 * RN-FIN-13: rodadas contempladas na ordem (ciclo.numero, sequencia), atravessando ciclos.
 * "Anterior/próxima contemplada" é sempre relativa a esta lista.
 */
async function contempladas(tx: Tx) {
  return tx.rodada.findMany({
    where: { status: { in: ['CONTEMPLADA', 'FECHADA'] } },
    orderBy: [{ ciclo: { numero: 'asc' } }, { sequencia: 'asc' }],
    select: {
      id: true,
      status: true,
      cicloId: true,
      contempladoId: true,
      dataSorteio: true,
      ciclo: { select: { numero: true } },
    },
  })
}

type RodadaContemplada = Awaited<ReturnType<typeof contempladas>>[number]

const vizinhas = (lista: RodadaContemplada[], id: string) => {
  const i = lista.findIndex((r) => r.id === id)
  return { anterior: i > 0 ? lista[i - 1] : undefined, proxima: i >= 0 ? lista[i + 1] : undefined }
}

const maisTardio = (a: string, b: string) => (a > b ? a : b)

/** RN-FIN-14: SOBRA da origem para o contemplado da destino (autoquitada se a mesma pessoa). */
export async function criarSobra(
  tx: Tx,
  ctx: Contexto,
  origem: { id: string; contempladoId: string },
  destino: { id: string; contempladoId: string; dataSorteio: Date | null },
  valorCentavos: number,
  aquisicaoReembolsoId: string | null = null,
): Promise<void> {
  if (valorCentavos <= 0) return
  const ja = await tx.obrigacao.findFirst({
    where: {
      tipo: { in: ['SOBRA', 'RATEIO_SOBRA'] },
      rodadaOrigemId: origem.id,
      aquisicaoReembolsoId,
      canceladaEm: null,
    },
    select: { id: true },
  })
  if (ja) return // idempotente (RN-GER-07, sobra_unica)
  const dia = maisTardio(
    destino.dataSorteio ? deDb(destino.dataSorteio) : dataLocal(ctx.agora),
    dataLocal(ctx.agora),
  )
  const o = await tx.obrigacao.create({
    data: {
      tipo: 'SOBRA',
      rodadaId: destino.id,
      rodadaOrigemId: origem.id,
      aquisicaoReembolsoId,
      devedorId: origem.contempladoId,
      credorId: destino.contempladoId,
      autoquitada: origem.contempladoId === destino.contempladoId,
      valorCentavos,
      vencimentoEm: fimDoDia(dia),
      criadaEm: ctx.agora,
    },
    select: { id: true },
  })
  await registrarEvento(tx, ctx, {
    acao: 'sobra.criar',
    entidade: 'obrigacao',
    entidadeId: o.id,
    dados: {
      depois: { origem: origem.id, destino: destino.id, valorCentavos, aquisicaoReembolsoId },
    },
  })
}

/**
 * RN-FIN-17 (D-18): sem ciclo seguinte, a SOBRA é rateada entre os participantes que não saíram
 * antes da conclusão; o resto vai para os primeiros na ordem de contemplação.
 */
export async function ratearSobra(
  tx: Tx,
  ctx: Contexto,
  origem: { id: string; cicloId: string; contempladoId: string },
  valorCentavos: number,
  aquisicaoReembolsoId: string | null = null,
): Promise<void> {
  if (valorCentavos <= 0) return
  const ja = await tx.obrigacao.count({
    where: {
      tipo: 'RATEIO_SOBRA',
      rodadaOrigemId: origem.id,
      aquisicaoReembolsoId,
      canceladaEm: null,
    },
  })
  if (ja > 0) return
  const ciclo = await tx.ciclo.findUniqueOrThrow({
    where: { id: origem.cicloId },
    select: { concluidoEm: true, encerradoEm: true },
  })
  const corte = ciclo.concluidoEm ?? ciclo.encerradoEm ?? ctx.agora
  const [participacoes, rodadas] = await Promise.all([
    tx.participacaoCiclo.findMany({
      where: { cicloId: origem.cicloId },
      select: { pessoaId: true, saiuEm: true },
    }),
    tx.rodada.findMany({
      where: {
        cicloId: origem.cicloId,
        contempladoId: { not: null },
        status: { notIn: ['ANULADA', 'CANCELADA'] },
      },
      orderBy: { sequencia: 'asc' },
      select: { contempladoId: true },
    }),
  ])
  const k = participacoes.filter((p) => !p.saiuEm || p.saiuEm >= corte).map((p) => p.pessoaId)
  const contemplados = rodadas.flatMap((r) =>
    r.contempladoId && k.includes(r.contempladoId) ? [r.contempladoId] : [],
  )
  const ordem = [
    ...new Set([...contemplados, ...k.filter((p) => !contemplados.includes(p)).sort()]),
  ]
  const vencimentoEm = fimDoDia(
    maisTardio(dataLocal(ciclo.encerradoEm ?? ctx.agora), dataLocal(ctx.agora)),
  )
  const cotas = ratear(valorCentavos, ordem).filter((c) => c.centavos > 0)
  await tx.obrigacao.createMany({
    data: cotas.map((c) => ({
      tipo: 'RATEIO_SOBRA' as const,
      rodadaId: origem.id,
      rodadaOrigemId: origem.id,
      aquisicaoReembolsoId,
      devedorId: origem.contempladoId,
      credorId: c.pessoaId,
      autoquitada: c.pessoaId === origem.contempladoId,
      valorCentavos: c.centavos,
      vencimentoEm,
      criadaEm: ctx.agora,
    })),
  })
  await registrarEvento(tx, ctx, {
    acao: 'sobra.ratear',
    entidade: 'rodada',
    entidadeId: origem.id,
    dados: { depois: { valorCentavos, cotas: cotas.length } },
  })
}

/**
 * RN-FIN-17: ao encerrar o ciclo sem ciclo seguinte, rateia as SOBRAs (principais e
 * complementares) das rodadas já fechadas que ainda não tinham destino. As que fecharem depois
 * rateiam no próprio fechamento. Idempotente.
 */
export async function ratearPendentesDoCiclo(tx: Tx, ctx: Contexto, cicloId: string) {
  const [fechadas, existentes, complementares] = await Promise.all([
    tx.rodada.findMany({
      where: { cicloId, status: 'FECHADA', sobraCentavos: { gt: 0 }, contempladoId: { not: null } },
      select: { id: true, contempladoId: true, sobraCentavos: true },
    }),
    tx.obrigacao.findMany({
      where: {
        tipo: { in: ['SOBRA', 'RATEIO_SOBRA'] },
        rodadaOrigem: { cicloId },
        canceladaEm: null,
      },
      select: { rodadaOrigemId: true, aquisicaoReembolsoId: true },
    }),
    tx.aquisicao.findMany({
      where: { rodada: { cicloId, status: 'FECHADA' }, complementarCentavos: { gt: 0 } },
      select: {
        id: true,
        rodadaId: true,
        complementarCentavos: true,
        rodada: { select: { contempladoId: true } },
      },
    }),
  ])
  const tem = new Set(
    existentes.map((o) => `${o.rodadaOrigemId ?? ''}:${o.aquisicaoReembolsoId ?? ''}`),
  )
  const pendentes = [
    ...fechadas.map((f) => ({
      origem: { id: f.id, cicloId, contempladoId: f.contempladoId ?? '' },
      valor: f.sobraCentavos ?? 0,
      aquisicaoId: null,
    })),
    ...complementares.map((a) => ({
      origem: { id: a.rodadaId, cicloId, contempladoId: a.rodada.contempladoId ?? '' },
      valor: a.complementarCentavos ?? 0,
      aquisicaoId: a.id,
    })),
  ].filter((p) => p.origem.contempladoId && !tem.has(`${p.origem.id}:${p.aquisicaoId ?? ''}`))
  for (const p of pendentes) {
    // eslint-disable-next-line no-await-in-loop -- poucas rodadas por ciclo; cada rateio audita
    await ratearSobra(tx, ctx, p.origem, p.valor, p.aquisicaoId)
  }
}

/** Prêmio da rodada com as SOBRAs destinadas a ela (RN-FIN-11). */
export async function premioDaRodada(tx: Tx, rodadaId: string) {
  const [r, sobras] = await Promise.all([
    tx.rodada.findUniqueOrThrow({
      where: { id: rodadaId },
      select: { contribuicaoCentavos: true, pagantesNoCorte: true },
    }),
    tx.obrigacao.findMany({
      where: { rodadaId, tipo: 'SOBRA' },
      select: { valorCentavos: true, canceladaEm: true },
    }),
  ])
  return premio(r, sobras)
}

/** Caso de fechamento vigente (RN-FIN-13 a–d), revalidando o solicitado; null = não fecha. */
async function casoDeFechamento(
  tx: Tx,
  rodadaId: string,
  agora: Date,
): Promise<MotivoFechamento | null> {
  const r = await tx.rodada.findUniqueOrThrow({
    where: { id: rodadaId },
    select: {
      status: true,
      prazoCompraAte: true,
      fechamentoSolicitado: true,
      aquisicoes: { select: { valorCentavos: true, reembolsoValorCentavos: true } },
      cessoes: {
        where: { status: { in: ['AGUARDANDO_ACEITE', 'EM_VOTACAO'] } },
        select: { id: true },
      },
    },
  })
  if (r.status !== 'CONTEMPLADA') return null
  const ativas = r.aquisicoes.filter(aquisicaoAtiva).length
  const semCessao = r.cessoes.length === 0
  if (r.fechamentoSolicitado) {
    const vale =
      r.fechamentoSolicitado === 'AQUISICAO_CONCLUIDA'
        ? ativas > 0 && semCessao
        : r.fechamentoSolicitado === 'CONVERTIDO_POR_ATA'
          ? ativas === 0
          : semCessao
    if (vale) return r.fechamentoSolicitado
    // o caso deixou de valer: zera e passa a valer (b)
    await tx.rodada.update({
      where: { id: rodadaId },
      data: { fechamentoSolicitado: null, fechamentoSolicitadoEm: null },
    })
  }
  if (semCessao && r.prazoCompraAte && agora >= r.prazoCompraAte && r.aquisicoes.length > 0) {
    return 'PRAZO_COM_AQUISICAO'
  }
  return null
}

export type ResultadoFechamento = 'FECHADA' | 'AGUARDANDO_ANTERIOR' | 'NAO_FECHA'

/**
 * RN-FIN-13: fecha `rodadaId` pelo `motivo` (ou pelo caso vigente), sob 'fechamento' (que o
 * chamador já tem) e 'rodada:id'. Com a anterior contemplada aberta, grava o pedido e aguarda.
 * Fechando, cria SOBRA ou rateio e tenta fechar a próxima em cadeia.
 */
export async function fecharRodada(
  tx: Tx,
  ctx: Contexto,
  rodadaId: string,
  motivo?: MotivoFechamento,
): Promise<ResultadoFechamento> {
  await travar(tx, 'fechamento')
  await travar(tx, `rodada:${rodadaId}`)
  const r = await tx.rodada.findUniqueOrThrow({
    where: { id: rodadaId },
    select: { status: true, contempladoId: true, cicloId: true, fechamentoSolicitado: true },
  })
  if (r.status !== 'CONTEMPLADA' || !r.contempladoId) return 'NAO_FECHA'

  const lista = await contempladas(tx)
  const { anterior, proxima } = vizinhas(lista, rodadaId)
  if (anterior && anterior.status !== 'FECHADA') {
    if (motivo && motivo !== 'PRAZO_COM_AQUISICAO') {
      await tx.rodada.update({
        where: { id: rodadaId },
        data: { fechamentoSolicitado: motivo, fechamentoSolicitadoEm: ctx.agora },
      })
    }
    return 'AGUARDANDO_ANTERIOR'
  }
  const caso = motivo ?? (await casoDeFechamento(tx, rodadaId, ctx.agora))
  if (!caso) return 'NAO_FECHA'

  const aquisicoes = await tx.aquisicao.findMany({
    where: { rodadaId },
    select: { valorCentavos: true, reembolsoValorCentavos: true },
  })
  const premioR = await premioDaRodada(tx, rodadaId)
  const gastoR = gasto(aquisicoes)
  const sobraR = sobra(premioR, gastoR)
  await tx.rodada.update({
    where: { id: rodadaId },
    data: {
      status: 'FECHADA',
      fechadaEm: ctx.agora,
      motivoFechamento: caso,
      gastoCentavos: gastoR,
      sobraCentavos: sobraR,
      fechamentoSolicitado: null,
      fechamentoSolicitadoEm: null,
    },
  })
  await registrarEvento(tx, ctx, {
    acao: 'rodada.fechar',
    entidade: 'rodada',
    entidadeId: rodadaId,
    dados: {
      depois: {
        motivo: caso,
        premioCentavos: premioR,
        gastoCentavos: gastoR,
        sobraCentavos: sobraR,
      },
    },
  })

  // RN-FIN-14/17: SOBRA para a próxima contemplada, ou rateio sem ciclo seguinte
  const origem = { id: rodadaId, cicloId: r.cicloId, contempladoId: r.contempladoId }
  if (proxima?.contempladoId) {
    await criarSobra(tx, ctx, origem, { ...proxima, contempladoId: proxima.contempladoId }, sobraR)
  } else {
    const ciclo = await tx.ciclo.findUniqueOrThrow({
      where: { id: r.cicloId },
      select: { status: true, semCicloSeguinte: true },
    })
    if (ciclo.status === 'ENCERRADO' && ciclo.semCicloSeguinte)
      await ratearSobra(tx, ctx, origem, sobraR)
  }

  // cadeia: a próxima que já pediu fechamento ou venceu com aquisição
  if (proxima?.status === 'CONTEMPLADA') {
    const casoProxima = await casoDeFechamento(tx, proxima.id, ctx.agora)
    if (casoProxima) await fecharRodada(tx, ctx, proxima.id, casoProxima)
  }
  return 'FECHADA'
}

/**
 * RN-SOR-10.3 / RN-FIN-14/16 e tick passo 4: SOBRAs pendentes (principal e complementares) de
 * rodadas fechadas antes da destino passam a ela. Idempotente.
 */
export async function ligarSobrasPendentes(
  tx: Tx,
  ctx: Contexto,
  destinoId: string,
): Promise<number> {
  const lista = await contempladas(tx)
  const i = lista.findIndex((x) => x.id === destinoId)
  const destino = lista[i]
  if (!destino?.contempladoId) return 0
  const anteriores = lista
    .slice(0, i)
    .filter((x) => x.status === 'FECHADA')
    .map((x) => x.id)
  if (anteriores.length === 0) return 0
  const [fechadas, existentes, complementares] = await Promise.all([
    tx.rodada.findMany({
      where: { id: { in: anteriores }, sobraCentavos: { gt: 0 } },
      select: { id: true, contempladoId: true, sobraCentavos: true },
    }),
    tx.obrigacao.findMany({
      where: {
        tipo: { in: ['SOBRA', 'RATEIO_SOBRA'] },
        rodadaOrigemId: { in: anteriores },
        canceladaEm: null,
      },
      select: { rodadaOrigemId: true, aquisicaoReembolsoId: true },
    }),
    tx.aquisicao.findMany({
      where: { rodadaId: { in: anteriores }, complementarCentavos: { gt: 0 } },
      select: {
        id: true,
        rodadaId: true,
        complementarCentavos: true,
        rodada: { select: { contempladoId: true } },
      },
    }),
  ])
  const tem = new Set(
    existentes.map((o) => `${o.rodadaOrigemId ?? ''}:${o.aquisicaoReembolsoId ?? ''}`),
  )
  const alvo = { ...destino, contempladoId: destino.contempladoId }
  let criadas = 0
  for (const f of fechadas) {
    if (!f.contempladoId || tem.has(`${f.id}:`)) continue
    // eslint-disable-next-line no-await-in-loop -- poucas rodadas; cada criação audita
    await criarSobra(
      tx,
      ctx,
      { id: f.id, contempladoId: f.contempladoId },
      alvo,
      f.sobraCentavos ?? 0,
    )
    criadas++
  }
  for (const a of complementares) {
    if (!a.rodada.contempladoId || tem.has(`${a.rodadaId}:${a.id}`)) continue
    // eslint-disable-next-line no-await-in-loop -- idem
    await criarSobra(
      tx,
      ctx,
      { id: a.rodadaId, contempladoId: a.rodada.contempladoId },
      alvo,
      a.complementarCentavos ?? 0,
      a.id,
    )
    criadas++
  }
  return criadas
}

/**
 * Tick, passos 3 e 4 (08 §7): fecha as rodadas vencidas com aquisição ou com pedido de fechamento,
 * em ordem, cada uma na própria transação; depois liga SOBRAs pendentes às contempladas abertas.
 */
export async function processarFechamentos(
  ctx: Contexto,
): Promise<{ fechadas: number; erros: string[] }> {
  const candidatas = await db.rodada.findMany({
    where: {
      status: 'CONTEMPLADA',
      OR: [
        { fechamentoSolicitado: { not: null } },
        { prazoCompraAte: { lte: ctx.agora }, aquisicoes: { some: {} } },
      ],
    },
    orderBy: [{ ciclo: { numero: 'asc' } }, { sequencia: 'asc' }],
    select: { id: true },
  })
  let fechadas = 0
  const erros: string[] = []
  for (const { id } of candidatas) {
    try {
      // eslint-disable-next-line no-await-in-loop -- ordem importa: a anterior fecha primeiro (RN-FIN-13)
      const r = await emTransacao((tx) => fecharRodada(tx, ctx, id))
      if (r === 'FECHADA') fechadas++
    } catch (e) {
      erros.push(`fechamento ${id}: ${e instanceof Error ? e.message : 'erro'}`)
    }
  }
  // rede de segurança (passo 4): SOBRAs que não nasceram no fechamento nem na contemplação
  const abertas = await db.rodada.findMany({
    where: { status: 'CONTEMPLADA' },
    select: { id: true },
  })
  for (const { id } of abertas) {
    try {
      // eslint-disable-next-line no-await-in-loop -- poucas rodadas abertas; idempotente
      await emTransacao(async (tx) => {
        await travar(tx, 'fechamento')
        await ligarSobrasPendentes(tx, ctx, id)
      })
    } catch (e) {
      erros.push(`sobra ${id}: ${e instanceof Error ? e.message : 'erro'}`)
    }
  }
  return { fechadas, erros }
}
