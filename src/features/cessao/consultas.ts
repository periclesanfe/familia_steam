import 'server-only'

import { somarHoras } from '@/domain/tempo'
import { db } from '@/server/db'

const nome = (p: { nome: string | null; apelido: string }) => p.nome ?? p.apelido

/**
 * 07 §3.4, aba Cessão: histórico das propostas da rodada e, para o contemplado vigente, os
 * beneficiários possíveis (RN-CES-01). As mesmas regras são revalidadas no servidor.
 */
export async function cessaoDaRodada(rodadaId: string, pessoaId: string, agora: Date) {
  const r = await db.rodada.findUnique({
    where: { id: rodadaId },
    select: {
      cicloId: true,
      status: true,
      contempladoId: true,
      tipoContemplacao: true,
      prazoCompraAte: true,
      _count: { select: { aquisicoes: true } },
      cessoes: {
        orderBy: { propostaEm: 'desc' },
        select: {
          id: true,
          status: true,
          cedenteId: true,
          beneficiarioId: true,
          propostaEm: true,
          encerradaEm: true,
          votacaoId: true,
          cedente: { select: { nome: true, apelido: true } },
          beneficiario: { select: { nome: true, apelido: true } },
        },
      },
    },
  })
  if (!r) return null
  const emAndamento = r.cessoes.some(
    (c) => c.status === 'AGUARDANDO_ACEITE' || c.status === 'EM_VOTACAO',
  )
  const bloqueio =
    r.status !== 'CONTEMPLADA'
      ? 'A rodada não está aberta.'
      : r.tipoContemplacao === 'OBRIGATORIA_ART14'
        ? 'Na contemplação obrigatória não há cessão (art. 14).'
        : r._count.aquisicoes > 0
          ? 'Já há compra registrada nesta rodada.'
          : !r.prazoCompraAte || agora >= r.prazoCompraAte
            ? 'O prazo de compra já venceu (art. 20).'
            : emAndamento
              ? 'Há uma cessão em andamento.'
              : null
  const souContemplado = r.contempladoId === pessoaId
  const [participantes, contemplados] =
    souContemplado && !bloqueio
      ? await Promise.all([
          db.participacaoCiclo.findMany({
            where: {
              cicloId: r.cicloId,
              saiuEm: null,
              pessoa: { membros: { some: { status: 'ATIVO' } } },
            },
            select: { pessoaId: true, pessoa: { select: { nome: true, apelido: true } } },
          }),
          db.rodada.findMany({
            where: {
              cicloId: r.cicloId,
              contempladoId: { not: null },
              status: { notIn: ['ANULADA', 'CANCELADA'] },
            },
            select: { contempladoId: true },
          }),
        ])
      : [[], []]
  const ja = new Set(contemplados.map((x) => x.contempladoId))
  return {
    souContemplado,
    bloqueio,
    exigeCiencia: !!r.prazoCompraAte && somarHoras(agora, 96) >= r.prazoCompraAte && !bloqueio,
    beneficiarios: participantes
      .filter((p) => !ja.has(p.pessoaId))
      .map((p) => ({ id: p.pessoaId, nome: nome(p.pessoa) })),
    cessoes: r.cessoes.map((c) => ({
      id: c.id,
      status: c.status,
      cedente: nome(c.cedente),
      beneficiario: nome(c.beneficiario),
      propostaEm: c.propostaEm,
      encerradaEm: c.encerradaEm,
      votacaoId: c.votacaoId,
      souCedente: c.cedenteId === pessoaId,
      souBeneficiario: c.beneficiarioId === pessoaId,
    })),
  }
}
