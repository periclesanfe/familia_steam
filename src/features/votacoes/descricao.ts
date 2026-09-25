import 'server-only'

import { formatarBRL } from '@/domain/dinheiro'
import type { Efeito } from '@/domain/efeitos'
import type { Tx } from '@/server/db'

/** Texto humano do efeito, para a tela e para a ATA. */
export async function descreverEfeito(
  tx: Pick<Tx, 'jogoBloqueado' | 'pessoa' | 'avisoCompra'>,
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
    case 'VETO_JOGO':
    case 'JOGO_DE_OUTRO_MEMBRO': {
      const a = await tx.avisoCompra.findUnique({
        where: { id: e.avisoId },
        select: { nome: true },
      })
      return e.tipo === 'VETO_JOGO'
        ? `vetar ${a?.nome ?? 'o jogo'} e incluí-lo no Anexo I`
        : `autorizar ${a?.nome ?? 'o jogo'}, que outro membro já tem`
    }
    case 'CONVERTER_PREMIO_EM_SOBRA':
      return 'fechar a rodada sem compra, com o prêmio inteiro como SOBRA'
    case 'REGULARIZAR_AQUISICAO':
      return 'regularizar a aquisição marcada como irregular'
    case 'PERMITIR_MULTIPLAS_AQUISICOES':
      return 'permitir mais de uma aquisição na rodada'
    case 'DESBLOQUEAR_CONTEUDO_ADULTO':
      return `liberar o app ${String(e.appId)} da checagem de conteúdo adulto (falso positivo)`
    case 'PERMANENCIA_ART30':
      return `excluir ${await apelido(e.pessoaId)} do consórcio${e.escopo === 'CONSORCIO_E_FAMILIA' ? ' e da família' : ''} (art. 30)`
    case 'RECONHECER_IMPOSSIBILIDADE':
      return `reconhecer a impossibilidade de pagamento de ${await apelido(e.pessoaId)}`
    case 'RECONHECER_SAIDA':
      return `reconhecer a saída de ${await apelido(e.pessoaId)} (${e.saida === 'SAIDA_FAMILIA' ? 'da família' : 'do consórcio'})`
    case 'RETORNO_SORTEIOS':
      return `devolver ${await apelido(e.pessoaId)} aos sorteios`
    case 'REVINCULAR_STEAM':
      return `trocar a conta Steam de ${await apelido(e.pessoaId)} para ${e.novoSteamId64}`
    case 'ALTERACAO_REGULAMENTO':
      return `aprovar nova versão do Regulamento: ${e.resumo}`
    default:
      return e.tipo
  }
}
