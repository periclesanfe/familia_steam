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
