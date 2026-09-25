// RN-VOT-02/04 (art. 41, p.u.): quórum e apuração de votação.
import type { MotivoEncerramentoVotacao, OpcaoVoto, StatusVotacao } from '@/generated/prisma/enums'

/** Maioria absoluta dos eleitores do snapshot: floor(n/2) + 1 (CHECK votacao_quorum). */
export function calcularQuorum(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('n deve ser inteiro ≥ 1')
  return Math.floor(n / 2) + 1
}

export type VotacaoParaApurar = {
  status: StatusVotacao
  encerraEm: Date
  eleitoresIds: readonly string[]
  impedidosIds: readonly string[]
  quorum: number
}

export type VotoParaApurar = { pessoaId: string; opcao: OpcaoVoto; votadoEm: Date }

export type Apuracao =
  | { status: 'ABERTA' }
  | { status: 'APROVADA' | 'REJEITADA'; motivo: MotivoEncerramentoVotacao; encerradaEm: Date }

/**
 * Apura depois de cada voto, de cada saída de eleitor e no tick (RN-VOT-04).
 * `membrosAtuais`: ids que ainda são MEMBRO agora (quem saiu deixa de ser pendente).
 */
export function apurarVotacao(
  votacao: VotacaoParaApurar,
  votos: readonly VotoParaApurar[],
  agora: Date,
  membrosAtuais: ReadonlySet<string>,
): Apuracao {
  if (votacao.status !== 'ABERTA') throw new RangeError('votação já encerrada')
  const validos = votos.filter((v) => v.votadoEm < votacao.encerraEm)
  const favor = validos.filter((v) => v.opcao === 'FAVOR')
  if (favor.length >= votacao.quorum) {
    // o voto que completou o quórum encerra a votação
    const ordenados = favor.map((v) => v.votadoEm.getTime()).sort((a, b) => a - b)
    const decisivo = ordenados[votacao.quorum - 1] ?? agora.getTime()
    return { status: 'APROVADA', motivo: 'QUORUM_ATINGIDO', encerradaEm: new Date(decisivo) }
  }
  if (agora >= votacao.encerraEm) {
    return { status: 'REJEITADA', motivo: 'PRAZO', encerradaEm: votacao.encerraEm }
  }
  const votaram = new Set(validos.map((v) => v.pessoaId))
  const impedidos = new Set(votacao.impedidosIds)
  const pendentes = votacao.eleitoresIds.filter(
    (id) => !votaram.has(id) && !impedidos.has(id) && membrosAtuais.has(id),
  ).length
  if (favor.length + pendentes < votacao.quorum) {
    return { status: 'REJEITADA', motivo: 'APROVACAO_IMPOSSIVEL', encerradaEm: agora }
  }
  return { status: 'ABERTA' }
}
