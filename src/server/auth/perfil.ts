import 'server-only'

import { cache } from 'react'

import { aberta } from '@/domain/financeiro'
import type { StatusMembro } from '@/generated/prisma/enums'

import { db, dbBase } from '../db'
import { comFamilia } from '../familia'
import { agora } from '../relogio'

export type Perfil = 'VISITANTE' | 'PENDENTE' | 'MEMBRO' | 'EX_COM_PENDENCIA' | 'EX_QUITADO'

export type PerfilAtual = {
  pessoaId: string
  perfil: Perfil
  /** Família em que a pessoa atua agora (15 §4); null para o VISITANTE. */
  familiaId: string | null
  membroId: string | null
  statusMembro: StatusMembro | null
}

/**
 * 04 §1 / RN-ACE-01: perfil derivado do estado a cada requisição, nunca gravado no cookie.
 * null = a pessoa não tem vínculo de membro (integrante não membro, ou desconhecida).
 */
export const perfilDe = cache(async (pessoaId: string): Promise<PerfilAtual | null> => {
  const pessoa = await dbBase.pessoa.findUnique({
    where: { id: pessoaId },
    select: { familiaId: true },
  })
  if (!pessoa) return null
  const visitante: PerfilAtual = {
    pessoaId,
    perfil: 'VISITANTE',
    familiaId: null,
    membroId: null,
    statusMembro: null,
  }
  const familiaId = pessoa.familiaId
  if (!familiaId) return visitante // RN-FAM-01
  return comFamilia(familiaId, async () => {
    const membros = await db.membro.findMany({
      where: { pessoaId },
      select: { id: true, status: true },
      orderBy: { criadoEm: 'desc' },
    })
    const aberto = membros.find((m) => m.status !== 'ENCERRADO')
    if (aberto) {
      const perfil =
        aberto.status === 'ATIVO' || aberto.status === 'IMPOSSIBILITADO' ? 'MEMBRO' : 'PENDENTE'
      return { pessoaId, perfil, familiaId, membroId: aberto.id, statusMembro: aberto.status }
    }
    const ultimo = membros[0]
    // RN-FAM-08/09: fora da família, só a pendência prende a pessoa ao consórcio anterior
    if (!ultimo || !(await temPendencia(pessoaId, agora()))) return visitante
    return {
      pessoaId,
      perfil: 'EX_COM_PENDENCIA' as const,
      familiaId,
      membroId: ultimo.id,
      statusMembro: ultimo.status,
    }
  })
})

/** Condições do EX_COM_PENDENCIA (04 §1), em número fixo de consultas (13 DP-02). */
async function temPendencia(pessoaId: string, t: Date): Promise<boolean> {
  const [obrigacoes, recebimentos, contemplacoes] = await Promise.all([
    db.obrigacao.findMany({
      where: {
        OR: [{ devedorId: pessoaId }, { credorId: pessoaId }],
        canceladaEm: null,
        autoquitada: false,
      },
      select: {
        valorCentavos: true,
        canceladaEm: true,
        autoquitada: true,
        pagamentos: { select: { status: true, formaDiversa: true, valorCentavos: true } },
      },
    }),
    db.pagamento.count({
      where: { recebedorId: pessoaId, status: { in: ['DECLARADO', 'CONTESTADO'] } },
    }),
    db.rodada.count({
      where: {
        contempladoId: pessoaId,
        OR: [{ status: 'CONTEMPLADA' }, { status: 'FECHADA', prazoCompraAte: { gt: t } }],
      },
    }),
  ])
  return obrigacoes.some((o) => aberta(o, o.pagamentos)) || recebimentos > 0 || contemplacoes > 0
}
