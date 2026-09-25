import 'server-only'

import { formatarBRL } from '@/domain/dinheiro'
import type { Efeito } from '@/domain/efeitos'
import type { Tx } from '@/server/db'

/** Texto humano do efeito, para a tela e para a ATA. */
export async function descreverEfeito(
  tx: Pick<Tx, 'jogoBloqueado' | 'pessoa'>,
  e: Efeito,
): Promise<string> {
  const apelido = async (id: string) =>
    (await tx.pessoa.findUnique({ where: { id }, select: { apelido: true } }))?.apelido ?? id
  switch (e.tipo) {
    case 'NENHUM':
      return 'nenhum (só registro da decisão)'
    case 'EXCLUSAO_BLOQUEIO': {
      const b = await tx.jogoBloqueado.findUnique({
        where: { numero: e.numero },
        select: { nome: true },
      })
      return `excluir a entrada nº ${String(e.numero).padStart(2, '0')} (${b?.nome ?? '?'}) do Anexo I`
    }
    case 'VALIDAR_PAGAMENTO':
      return 'validar o pagamento contestado'
    case 'INVALIDAR_PAGAMENTO':
      return 'invalidar o pagamento contestado'
    case 'CANCELAR_OBRIGACAO':
      return 'cancelar a obrigação'
    case 'CRIAR_DEVOLUCAO':
      return `criar devolução de ${formatarBRL(e.valorCentavos)} de ${await apelido(e.devedorId)} para ${await apelido(e.credorId)}`
    case 'SUSPENDER_CONTRIBUICOES':
      return `suspender as contribuições de ${await apelido(e.pessoaId)} no ciclo`
    case 'ALTERACAO_REGULAMENTO':
      return `aprovar nova versão do Regulamento: ${e.resumo}`
    default:
      return e.tipo
  }
}
