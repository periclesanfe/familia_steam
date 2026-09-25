// RN-FIN (docs/spec/02 §6). Funções puras sobre fatos.
import type { StatusPagamento } from '@/generated/prisma/enums'

import { somarDiasAoInstante } from './tempo'

export type PagamentoFato = {
  status: StatusPagamento
  formaDiversa: boolean
  valorCentavos: number
  pixEm?: Date
}
export type ObrigacaoFato = {
  valorCentavos: number
  canceladaEm: Date | null
  autoquitada: boolean
}

/** RN-FIN-06 (D-19): DECLARADO, CONFIRMADO e CONTESTADO contam; forma diversa só confirmada. */
export const pagamentoConta = (p: PagamentoFato): boolean =>
  p.formaDiversa ? p.status === 'CONFIRMADO' : p.status !== 'INVALIDADO'

/** RN-FIN-08: soma dos pagamentos que contam com pixEm < antes (sem `antes`, todos). */
export const pagosAte = (pagamentos: readonly PagamentoFato[], antes?: Date): number =>
  pagamentos
    .filter((p) => pagamentoConta(p) && (!antes || (p.pixEm !== undefined && p.pixEm < antes)))
    .reduce((soma, p) => soma + p.valorCentavos, 0)

export const saldo = (o: ObrigacaoFato, pagamentos: readonly PagamentoFato[]): number =>
  o.valorCentavos - pagosAte(pagamentos)

/** Obrigação ainda viva: não cancelada, não autoquitada e com saldo. */
export const aberta = (o: ObrigacaoFato, pagamentos: readonly PagamentoFato[]): boolean =>
  !o.canceladaEm && !o.autoquitada && saldo(o, pagamentos) > 0

/** RN-FIN-03: justificada antes do vencimento → +diasProrrogacao no mesmo horário (SP). */
export const vencimentoEfetivo = (
  o: { vencimentoEm: Date; justificadaEm: Date | null },
  diasProrrogacao: number,
): Date =>
  o.justificadaEm && o.justificadaEm < o.vencimentoEm
    ? somarDiasAoInstante(o.vencimentoEm, diasProrrogacao)
    : o.vencimentoEm

export type ContribuicaoFato = ObrigacaoFato & {
  id: string
  devedorId: string
  cicloId: string
  vencimentoEm: Date
  justificadaEm: Date | null
  diasProrrogacao: number // da versão gravada na rodada (C-PARAM)
  pagamentos: readonly PagamentoFato[]
}

/** RN-FIN-08: fato histórico — entrou em atraso (não pagou tudo até o vencimento efetivo). */
export function emAtraso(o: ContribuicaoFato, t: Date): boolean {
  if (o.canceladaEm || o.autoquitada) return false
  const venc = vencimentoEfetivo(o, o.diasProrrogacao)
  return t >= venc && pagosAte(o.pagamentos, venc) < o.valorCentavos
}

/** Vencida em t e ainda com saldo (RN-SOR-06). */
export const vencidaEmAberto = (o: ContribuicaoFato, t: Date): boolean =>
  !o.canceladaEm &&
  !o.autoquitada &&
  vencimentoEfetivo(o, o.diasProrrogacao) <= t &&
  saldo(o, o.pagamentos) > 0

export type Situacao =
  | 'CANCELADA'
  | 'AUTOQUITADA'
  | 'QUITADA'
  | 'QUITADA_EM_ATRASO'
  | 'EM_ATRASO'
  | 'PRORROGADA'
  | 'NO_PRAZO'

/** 07 §3.4/§3.5: situação exibida na aba Pagamentos e na grade do ciclo (RN-FIN-08). */
export function situacao(o: ContribuicaoFato, t: Date): Situacao {
  if (o.canceladaEm) return 'CANCELADA'
  if (o.autoquitada) return 'AUTOQUITADA'
  const atrasou = emAtraso(o, t)
  if (saldo(o, o.pagamentos) <= 0) return atrasou ? 'QUITADA_EM_ATRASO' : 'QUITADA'
  if (atrasou) return 'EM_ATRASO'
  return vencimentoEfetivo(o, o.diasProrrogacao) > o.vencimentoEm ? 'PRORROGADA' : 'NO_PRAZO'
}

type AquisicaoFato = { valorCentavos: number; reembolsoValorCentavos: number | null }

/** RN-FIN-11: PRÊMIO nominal = contribuição × pagantes no corte + SOBRAs destinadas à rodada. */
export const premio = (
  r: { contribuicaoCentavos: number | null; pagantesNoCorte: number | null },
  sobrasDestinadas: readonly { valorCentavos: number; canceladaEm: Date | null }[],
): number =>
  (r.contribuicaoCentavos ?? 0) * (r.pagantesNoCorte ?? 0) +
  sobrasDestinadas.filter((s) => !s.canceladaEm).reduce((t, s) => t + s.valorCentavos, 0)

/** RN-FIN-12: gasto descontando reembolsos; compra irregular entra no gasto (D-10). */
export const gasto = (aquisicoes: readonly AquisicaoFato[]): number =>
  aquisicoes.reduce((t, a) => t + a.valorCentavos - (a.reembolsoValorCentavos ?? 0), 0)

export const sobra = (premioCentavos: number, gastoCentavos: number): number =>
  Math.max(0, premioCentavos - gastoCentavos)

export const complementacao = (premioCentavos: number, gastoCentavos: number): number =>
  Math.max(0, gastoCentavos - premioCentavos)

/**
 * RN-FIN-17 (D-18): S dividido entre k pessoas; os `resto` primeiros da ordem recebem +1 centavo.
 * Ordem: contemplados do ciclo na ordem de contemplação, depois os demais por pessoaId.
 */
export function ratear(
  total: number,
  ordem: readonly string[],
): { pessoaId: string; centavos: number }[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError('total inválido')
  const k = ordem.length
  if (k === 0) return []
  const q = Math.floor(total / k)
  const resto = total % k
  return ordem.map((pessoaId, i) => ({ pessoaId, centavos: q + (i < resto ? 1 : 0) }))
}

/** RN-FIN-16: SOBRA complementar gerada por um reembolso numa rodada já fechada. */
export const complementar = (e: {
  premioCentavos: number
  gastoNovoCentavos: number
  sobraCentavos: number
  outrasComplementares: number
}): number =>
  Math.max(
    0,
    Math.max(0, e.premioCentavos - e.gastoNovoCentavos) - e.sobraCentavos - e.outrasComplementares,
  )

/** RN-FIN-18: conservação por rodada fechada (alerta se divergir). */
export const conservaRodada = (e: {
  premioCentavos: number
  gastoCentavos: number
  sobraCentavos: number
  complementares: number
}): boolean =>
  Math.min(e.gastoCentavos, e.premioCentavos) + e.sobraCentavos + e.complementares ===
  e.premioCentavos

export type CessaoAprovadaFato = { cedenteId: string; encerradaEm: Date }

/**
 * RN-FIN-04: para quem pode ter ido o Pix. Em CONTRIBUICAO, SOBRA e REPASSE_CESSAO, além do
 * credor atual, os cedentes das cessões aprovadas depois que a obrigação nasceu (o credor foi
 * redirecionado). Default: o credor vigente em `pixEm`, descartado o cedente que é o devedor.
 */
export function recebedores(
  o: { tipo: string; devedorId: string; credorId: string; criadaEm: Date },
  cessoes: readonly CessaoAprovadaFato[],
  pixEm: Date,
): { opcoes: string[]; padrao: string } {
  if (!['CONTRIBUICAO', 'SOBRA', 'REPASSE_CESSAO'].includes(o.tipo)) {
    return { opcoes: [o.credorId], padrao: o.credorId }
  }
  const depois = cessoes
    .filter((c) => c.encerradaEm > o.criadaEm && c.cedenteId !== o.devedorId)
    .toSorted((a, b) => a.encerradaEm.getTime() - b.encerradaEm.getTime())
  return {
    opcoes: [...new Set([...depois.map((c) => c.cedenteId), o.credorId])],
    padrao: depois.find((c) => c.encerradaEm > pixEm)?.cedenteId ?? o.credorId,
  }
}
