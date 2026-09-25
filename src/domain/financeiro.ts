// RN-FIN (docs/spec/02 §5). Funções puras sobre fatos; o restante do módulo entra no M5.
import type { StatusPagamento } from '@/generated/prisma/enums'

type PagamentoFato = { status: StatusPagamento; formaDiversa: boolean; valorCentavos: number }
type ObrigacaoFato = { valorCentavos: number; canceladaEm: Date | null; autoquitada: boolean }

/** RN-FIN-06 (D-19): DECLARADO, CONFIRMADO e CONTESTADO contam; forma diversa só confirmada. */
export const pagamentoConta = (p: PagamentoFato): boolean =>
  p.formaDiversa ? p.status === 'CONFIRMADO' : p.status !== 'INVALIDADO'

export const saldo = (o: ObrigacaoFato, pagamentos: readonly PagamentoFato[]): number =>
  o.valorCentavos - pagamentos.filter(pagamentoConta).reduce((soma, p) => soma + p.valorCentavos, 0)

/** Obrigação ainda viva: não cancelada, não autoquitada e com saldo. */
export const aberta = (o: ObrigacaoFato, pagamentos: readonly PagamentoFato[]): boolean =>
  !o.canceladaEm && !o.autoquitada && saldo(o, pagamentos) > 0
