import 'server-only'

import { exigir } from '@/domain/erros'
import { type DataCivil, dataLocal, deDb, paraDb, somarAnos } from '@/domain/tempo'
import type { ContextoAcao } from '@/server/acao'
import { registrarEvento } from '@/server/auditoria'
import { emTransacao, travar } from '@/server/tx'

/**
 * RN-CAD-08/09: qualquer membro registra que o convite ou a remoção autorizados por ATA foram
 * executados na Steam. Remoção grava saiuEm e bloqueia a vaga por 1 ano da entrada (RN-CAD-11).
 */
export async function registrarExecucao(
  ctx: ContextoAcao,
  e: { integranteId: string; executadaEm: DataCivil },
): Promise<void> {
  return emTransacao(async (tx) => {
    await travar(tx, `integrante:${e.integranteId}`)
    const i = await tx.integranteFamilia.findUniqueOrThrow({ where: { id: e.integranteId } })
    exigir(
      i.status === 'CONVITE_AUTORIZADO' || i.status === 'REMOCAO_AUTORIZADA',
      'ENTRADA_INVALIDA',
      'Não há convite nem remoção autorizados para este integrante.',
      'art. 7º',
    )
    exigir(
      e.executadaEm <= dataLocal(ctx.agora),
      'ENTRADA_INVALIDA',
      'A data não pode estar no futuro.',
    )
    const dados =
      i.status === 'CONVITE_AUTORIZADO'
        ? { status: 'ATIVO' as const, entrouEm: paraDb(e.executadaEm) }
        : (() => {
            const bloqueio = somarAnos(i.entrouEm ? deDb(i.entrouEm) : e.executadaEm, 1)
            return {
              status: 'REMOVIDO' as const,
              saiuEm: paraDb(e.executadaEm),
              vagaBloqueadaAte: bloqueio > e.executadaEm ? paraDb(bloqueio) : null,
            }
          })()
    await tx.integranteFamilia.update({
      where: { id: i.id },
      data: { ...dados, execucaoRegistradaPorId: ctx.ator.pessoaId },
    })
    await registrarEvento(tx, ctx, {
      acao: 'integrante.executar',
      entidade: 'integrante_familia',
      entidadeId: i.id,
      dados: { antes: { status: i.status }, depois: { ...dados } },
    })
  })
}
