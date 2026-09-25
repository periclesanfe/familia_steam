import 'server-only'

import { exigir } from '@/domain/erros'
import { type DataCivil, paraDb } from '@/domain/tempo'
import type { ContextoAcao } from '@/server/acao'
import { registrarEvento } from '@/server/auditoria'
import { emTransacao } from '@/server/tx'

type Evento = { nome: string; inicio: DataCivil; fim: DataCivil; fonteUrl: string }

// 15 §6: evento global (vale para todas as famílias); quem cadastra fica na auditoria.
export async function adicionarEvento(ctx: ContextoAcao, e: Evento) {
  exigir(e.inicio <= e.fim, 'ENTRADA_INVALIDA', 'O fim precisa ser depois do início.')
  return emTransacao(async (tx) => {
    const criado = await tx.eventoPromocao.create({
      data: {
        nome: e.nome,
        inicio: paraDb(e.inicio),
        fim: paraDb(e.fim),
        fonteUrl: e.fonteUrl,
        criadoPorId: ctx.ator.pessoaId,
        criadoEm: ctx.agora,
      },
    })
    await registrarEvento(tx, ctx, {
      acao: 'promocao.adicionar',
      entidade: 'EventoPromocao',
      entidadeId: criado.id,
      dados: { depois: e },
    })
    return criado.id
  })
}

// 15 §6: só quem cadastrou remove (guarda sobre o banco, 14 SEG-01).
export async function removerEvento(ctx: ContextoAcao, e: { eventoId: string }) {
  await emTransacao(async (tx) => {
    const antes = await tx.eventoPromocao.findUnique({ where: { id: e.eventoId } })
    exigir(antes, 'NAO_ENCONTRADO')
    exigir(antes.criadoPorId === ctx.ator.pessoaId, 'SEM_PERMISSAO')
    await tx.eventoPromocao.delete({ where: { id: e.eventoId } })
    await registrarEvento(tx, ctx, {
      acao: 'promocao.remover',
      entidade: 'EventoPromocao',
      entidadeId: e.eventoId,
      dados: { antes },
    })
  })
}
