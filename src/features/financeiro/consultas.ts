import 'server-only'

import {
  type ContribuicaoFato,
  saldo,
  situacao,
  type Situacao,
  vencimentoEfetivo,
} from '@/domain/financeiro'
import { parametrosSchema } from '@/domain/regulamento'
import { deDb } from '@/domain/tempo'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/server/db'

const selecaoObrigacao = {
  id: true,
  tipo: true,
  rodadaId: true,
  devedorId: true,
  credorId: true,
  valorCentavos: true,
  vencimentoEm: true,
  justificadaEm: true,
  justificativa: true,
  canceladaEm: true,
  autoquitada: true,
  devedor: { select: { apelido: true } },
  credor: { select: { apelido: true, chavePix: true, chavePixAlteradaEm: true } },
  rodada: {
    select: {
      sequencia: true,
      mesReferencia: true,
      cicloId: true,
      ciclo: { select: { numero: true } },
      versaoRegulamento: { select: { parametros: true } },
    },
  },
  pagamentos: {
    orderBy: { registradoEm: 'asc' },
    select: {
      id: true,
      valorCentavos: true,
      pixEm: true,
      status: true,
      formaDiversa: true,
      recebedorId: true,
      comprovanteId: true,
      registradoPorId: true,
      registradoEm: true,
      motivoContestacao: true,
    },
  },
} satisfies Prisma.ObrigacaoSelect

type ObrigacaoLida = Prisma.ObrigacaoGetPayload<{ select: typeof selecaoObrigacao }>

export type ObrigacaoDTO = {
  id: string
  tipo: ObrigacaoLida['tipo']
  devedorId: string
  devedor: string
  credorId: string
  credor: string
  rodada: { id: string; sequencia: number; mesReferencia: string; ciclo: number }
  valorCentavos: number
  saldoCentavos: number
  vencimentoEfetivo: Date
  prorrogada: boolean
  justificativa: string | null
  situacao: Situacao
  chavePixCredor: string | null
  chavePixAlteradaEm: Date | null
  pagamentos: ObrigacaoLida['pagamentos']
}

/** Converte a linha do banco no fato do domínio e no DTO da tela (13 DP-04). */
function paraDTO(o: ObrigacaoLida, agora: Date, verPix: boolean): ObrigacaoDTO {
  const fato: ContribuicaoFato = {
    ...o,
    cicloId: o.rodada.cicloId,
    diasProrrogacao: parametrosSchema.parse(o.rodada.versaoRegulamento?.parametros).diasProrrogacao,
  }
  const venc = vencimentoEfetivo(fato, fato.diasProrrogacao)
  return {
    id: o.id,
    tipo: o.tipo,
    devedorId: o.devedorId,
    devedor: o.devedor.apelido,
    credorId: o.credorId,
    credor: o.credor.apelido,
    rodada: {
      id: o.rodadaId,
      sequencia: o.rodada.sequencia,
      mesReferencia: o.rodada.mesReferencia,
      ciclo: o.rodada.ciclo.numero,
    },
    valorCentavos: o.valorCentavos,
    saldoCentavos: saldo(o, o.pagamentos),
    vencimentoEfetivo: venc,
    prorrogada: venc > o.vencimentoEm,
    justificativa: o.justificativa,
    situacao: situacao(fato, agora),
    chavePixCredor: verPix ? o.credor.chavePix : null,
    chavePixAlteradaEm: o.credor.chavePixAlteradaEm,
    pagamentos: o.pagamentos,
  }
}

/** 07 §3.4, aba Pagamentos: obrigações da rodada, prêmio nominal × recebido (RN-FIN-11). */
export async function pagamentosDaRodada(rodadaId: string, agora: Date) {
  const [rodada, obrigacoes] = await Promise.all([
    db.rodada.findUniqueOrThrow({
      where: { id: rodadaId },
      select: { contribuicaoCentavos: true, pagantesNoCorte: true, contempladoId: true },
    }),
    db.obrigacao.findMany({
      where: { rodadaId },
      select: selecaoObrigacao,
      orderBy: [{ tipo: 'asc' }, { devedor: { apelido: 'asc' } }],
    }),
  ])
  const dtos = obrigacoes.map((o) => paraDTO(o, agora, true))
  const premio = (rodada.contribuicaoCentavos ?? 0) * (rodada.pagantesNoCorte ?? 0)
  const recebido = dtos
    .filter((o) => o.tipo === 'CONTRIBUICAO' && o.credorId === rodada.contempladoId)
    .reduce(
      (s, o) => s + (o.valorCentavos - (o.situacao === 'AUTOQUITADA' ? 0 : o.saldoCentavos)),
      0,
    )
  // ponytail: SOBRAs destinadas à rodada entram no prêmio no M7 (RN-FIN-11)
  return { premioCentavos: premio, recebidoCentavos: recebido, obrigacoes: dtos }
}

/** RN-FIN-19: obrigações abertas (não canceladas, não autoquitadas, com saldo). */
export async function obrigacoesAbertas(
  agora: Date,
  filtro: { pessoaId?: string; tipo?: ObrigacaoLida['tipo']; soVencidas?: boolean } = {},
) {
  const linhas = await db.obrigacao.findMany({
    where: {
      canceladaEm: null,
      autoquitada: false,
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
      ...(filtro.pessoaId
        ? { OR: [{ devedorId: filtro.pessoaId }, { credorId: filtro.pessoaId }] }
        : {}),
    },
    select: selecaoObrigacao,
    orderBy: { vencimentoEm: 'asc' },
  })
  // ponytail: saldo calculado em memória (a regra do que conta é do domínio); volume de centenas (13 §1)
  return linhas
    .map((o) => paraDTO(o, agora, true))
    .filter((o) => o.saldoCentavos > 0 && (!filtro.soVencidas || o.vencimentoEfetivo <= agora))
}

/** RN-FIN-19: quem deve a quem — soma dos saldos abertos por par, com vencidos à parte. */
export async function quemDeveAQuem(agora: Date) {
  const abertas = await obrigacoesAbertas(agora)
  const pares = new Map<
    string,
    {
      devedor: string
      credor: string
      devedorId: string
      credorId: string
      total: number
      vencido: number
    }
  >()
  for (const o of abertas) {
    const chave = `${o.devedorId}>${o.credorId}`
    const par = pares.get(chave) ?? {
      devedor: o.devedor,
      credor: o.credor,
      devedorId: o.devedorId,
      credorId: o.credorId,
      total: 0,
      vencido: 0,
    }
    par.total += o.saldoCentavos
    if (o.vencimentoEfetivo <= agora) par.vencido += o.saldoCentavos
    pares.set(chave, par)
  }
  return {
    pares: [...pares.values()].sort((a, b) => b.vencido - a.vencido || b.total - a.total),
    abertas,
  }
}

/** 07 §3.6: extrato da pessoa (como devedora e como credora). */
export async function extrato(pessoaId: string, agora: Date) {
  const [pessoa, obrigacoes, contemplacoes] = await Promise.all([
    db.pessoa.findUnique({
      where: { id: pessoaId },
      select: { id: true, apelido: true, nome: true },
    }),
    db.obrigacao.findMany({
      where: { OR: [{ devedorId: pessoaId }, { credorId: pessoaId }] },
      select: selecaoObrigacao,
      orderBy: { vencimentoEm: 'asc' },
    }),
    db.rodada.findMany({
      where: { contempladoId: pessoaId, status: { notIn: ['ANULADA', 'CANCELADA'] } },
      select: {
        id: true,
        sequencia: true,
        mesReferencia: true,
        contribuicaoCentavos: true,
        pagantesNoCorte: true,
        ciclo: { select: { numero: true } },
      },
      orderBy: { agendadaPara: 'asc' },
    }),
  ])
  if (!pessoa) return null
  const dtos = obrigacoes.map((o) => paraDTO(o, agora, false))
  const devo = dtos.filter(
    (o) => o.devedorId === pessoaId && o.situacao !== 'AUTOQUITADA' && o.situacao !== 'CANCELADA',
  )
  const recebo = dtos.filter(
    (o) => o.credorId === pessoaId && o.situacao !== 'AUTOQUITADA' && o.situacao !== 'CANCELADA',
  )
  return {
    pessoa,
    devo,
    recebo,
    contemplacoes: contemplacoes.map((r) => ({
      ...r,
      premioCentavos: (r.contribuicaoCentavos ?? 0) * (r.pagantesNoCorte ?? 0),
    })),
    totais: {
      devoAberto: devo.reduce((s, o) => s + o.saldoCentavos, 0),
      receboAberto: recebo.reduce((s, o) => s + o.saldoCentavos, 0),
      atrasos: devo.filter((o) => o.situacao === 'EM_ATRASO' || o.situacao === 'QUITADA_EM_ATRASO')
        .length,
    },
  }
}

/** 07 §3.5: grade membros × rodadas do ciclo (a "planilha"). */
export async function gradeDoCiclo(numero: number, agora: Date) {
  const ciclo = await db.ciclo.findUnique({ where: { numero } })
  if (!ciclo) return null
  const [participacoes, rodadas, obrigacoes] = await Promise.all([
    db.participacaoCiclo.findMany({
      where: { cicloId: ciclo.id },
      select: { pessoaId: true, saiuEm: true, pessoa: { select: { apelido: true } } },
      orderBy: { pessoa: { apelido: 'asc' } },
    }),
    db.rodada.findMany({
      where: { cicloId: ciclo.id, status: { not: 'CANCELADA' } },
      select: {
        id: true,
        sequencia: true,
        mesReferencia: true,
        status: true,
        contribuicaoCentavos: true,
        pagantesNoCorte: true,
        contemplado: { select: { apelido: true } },
      },
      orderBy: [{ sequencia: 'asc' }, { criadaEm: 'asc' }],
    }),
    db.obrigacao.findMany({
      where: { tipo: 'CONTRIBUICAO', rodada: { cicloId: ciclo.id } },
      select: selecaoObrigacao,
    }),
  ])
  const celulas = new Map<string, Situacao>()
  for (const o of obrigacoes)
    celulas.set(`${o.devedorId}:${o.rodadaId}`, paraDTO(o, agora, false).situacao)
  return {
    ciclo: { numero: ciclo.numero, status: ciclo.status, dataInicio: deDb(ciclo.dataInicio) },
    participantes: participacoes.map((p) => ({
      pessoaId: p.pessoaId,
      apelido: p.pessoa.apelido,
      saiu: p.saiuEm !== null,
    })),
    rodadas: rodadas.map((r) => ({
      ...r,
      contemplado: r.contemplado?.apelido ?? null,
      premioCentavos: (r.contribuicaoCentavos ?? 0) * (r.pagantesNoCorte ?? 0),
    })),
    situacaoDe: Object.fromEntries(celulas),
  }
}

/** 07 §4.1: pendências financeiras da pessoa (pagar, confirmar recebimento). */
export async function pendenciasFinanceiras(pessoaId: string, agora: Date) {
  const [abertas, aConfirmar] = await Promise.all([
    obrigacoesAbertas(agora, { pessoaId }),
    db.pagamento.findMany({
      where: { recebedorId: pessoaId, status: 'DECLARADO' },
      select: {
        id: true,
        valorCentavos: true,
        pixEm: true,
        obrigacao: { select: { rodadaId: true, devedor: { select: { apelido: true } } } },
      },
      orderBy: { pixEm: 'asc' },
    }),
  ])
  return { pagar: abertas.filter((o) => o.devedorId === pessoaId), aConfirmar }
}
