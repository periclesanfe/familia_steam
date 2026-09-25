import 'server-only'

import { exigir } from '@/domain/erros'
import { hashVersao } from '@/domain/hash'
import { type Parametros, versaoVigente } from '@/domain/regulamento'
import { convocar } from '@/features/votacoes/servico'
import type { ContextoAcao } from '@/server/acao'
import { registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'
import { emTransacao, travar } from '@/server/tx'

const ABERTO = { status: { not: 'ENCERRADO' as const } }

async function emVigor(tx: Tx, agora: Date) {
  const versoes = await tx.versaoRegulamento.findMany({
    select: { id: true, ordem: true, vigenteDesde: true, numero: true },
  })
  return versaoVigente(versoes, agora)
}

/**
 * RN-REG-08: antes da vigência, qualquer membro da família edita o rascunho da 1.0 (texto e
 * parâmetros). O sha256 muda e as assinaturas feitas sobre o texto anterior deixam de valer
 * (adesaoValida compara o hash): todos assinam de novo o texto final. Cada edição fica na
 * auditoria com o antes e o depois, para o histórico e o diff.
 */
export async function editarRascunho(
  ctx: ContextoAcao,
  e: { texto: string; parametros: Parametros; resumo: string },
): Promise<{ assinaturasInvalidadas: number }> {
  return emTransacao(async (tx) => {
    await travar(tx, 'regulamento') // mesma chave da última assinatura: uma vigência só
    const eu = ctx.ator.pessoaId
    exigir(await tx.membro.count({ where: { pessoaId: eu, ...ABERTO } }), 'SEM_PERMISSAO')
    exigir(!(await emVigor(tx, ctx.agora)), 'REGULAMENTO_EM_VIGOR')
    const v10 = await tx.versaoRegulamento.findFirstOrThrow({
      where: { ordem: 0 },
      select: { id: true, textoMarkdown: true, parametros: true, sha256: true },
    })
    const sha256 = hashVersao(e.texto, e.parametros)
    exigir(sha256 !== v10.sha256, 'SEM_ALTERACAO')
    const assinaturasInvalidadas = await tx.adesao.count({
      where: { versaoId: v10.id, sha256Versao: v10.sha256 },
    })
    await tx.versaoRegulamento.update({
      where: { id: v10.id },
      data: { textoMarkdown: e.texto, parametros: e.parametros, sha256 },
    })
    await registrarEvento(tx, ctx, {
      acao: 'regulamento.rascunho',
      entidade: 'versao_regulamento',
      entidadeId: v10.id,
      dados: {
        antes: { sha256: v10.sha256, texto: v10.textoMarkdown, parametros: v10.parametros },
        depois: {
          sha256,
          texto: e.texto,
          parametros: e.parametros,
          resumo: e.resumo,
          assinaturasInvalidadas,
        },
      },
    })
    return { assinaturasInvalidadas }
  })
}

/**
 * RN-REG-03 (art. 42): depois da vigência, a mudança é pedida por votação ALTERACAO_REGULAMENTO
 * com o texto integral proposto, o resumo e os parâmetros; aprovada, vale no dia 1º do mês
 * seguinte. Uma aberta por vez (RN-REG-04, índice único por família).
 */
export async function proporAlteracao(
  ctx: ContextoAcao,
  e: { texto: string; parametros: Parametros; resumo: string; justificativa: string },
): Promise<{ votacaoId: string }> {
  return convocar(ctx, {
    assunto: 'ALTERACAO_REGULAMENTO',
    proposicao: `Aprovar a alteração do Regulamento: ${e.resumo}`,
    justificativa: e.justificativa,
    efeito: {
      tipo: 'ALTERACAO_REGULAMENTO',
      texto: e.texto,
      resumo: e.resumo,
      parametros: e.parametros,
      excluirEntradas: [],
    },
  })
}
