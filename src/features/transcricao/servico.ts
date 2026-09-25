import 'server-only'

import { exigir } from '@/domain/erros'
import { justificarObrigacao } from '@/features/financeiro/servico'
import { responderProximoCiclo } from '@/features/rodadas/janela'
import { declararNaoConcorrer } from '@/features/rodadas/servico'
import type { ContextoAcao } from '@/server/acao'
import { registrarEvento } from '@/server/auditoria'
import { db } from '@/server/db'
import { emTransacao, travar } from '@/server/tx'

import type { Transcricao } from './ato'

export type AtoTranscrevivel =
  | { tipo: 'NAO_CONCORRER'; rodadaId: string }
  | { tipo: 'CONFIRMA_PROXIMO_CICLO' | 'RECUSA_PROXIMO_CICLO'; cicloId: string }
  | { tipo: 'JUSTIFICATIVA_PRORROGACAO'; obrigacaoId: string; texto: string }

/**
 * RN-GER-05 (D-01): qualquer membro registra em nome de outro só estes atos, com print e o
 * horário da mensagem no GRUPO; os limites de cada ato valem para `efetivaEm` e `registradaEm`.
 * Impossibilidade, saídas, voto, aceites, aviso e compra não têm esta via (CA-119).
 */
export async function transcrever(ctx: ContextoAcao, t: Transcricao, ato: AtoTranscrevivel) {
  exigir(
    t.pessoaId !== ctx.ator.pessoaId,
    'ENTRADA_INVALIDA',
    'Para um ato seu, use a ação direta.',
  )
  exigir(t.efetivaEm <= ctx.agora, 'ENTRADA_INVALIDA', 'O horário da mensagem está no futuro.')
  switch (ato.tipo) {
    case 'NAO_CONCORRER':
      return declararNaoConcorrer(ctx, ato, t)
    case 'CONFIRMA_PROXIMO_CICLO':
    case 'RECUSA_PROXIMO_CICLO':
      return responderProximoCiclo(
        ctx,
        { cicloId: ato.cicloId, confirma: ato.tipo === 'CONFIRMA_PROXIMO_CICLO' },
        t,
      )
    case 'JUSTIFICATIVA_PRORROGACAO':
      return justificarObrigacao(ctx, ato, t)
  }
}

/**
 * RN-GER-05: o sujeito revoga o que transcreveram em seu nome — não concorrer até o corte;
 * confirmação ou recusa até o corte da 1ª rodada, mesmo depois do prazo (CA-115).
 */
export async function revogarTranscricao(ctx: ContextoAcao, e: { declaracaoId: string }) {
  const d = await db.declaracao.findUniqueOrThrow({
    where: { id: e.declaracaoId },
    select: {
      pessoaId: true,
      registradaPorId: true,
      revogadaEm: true,
      tipo: true,
      rodadaId: true,
      cicloId: true,
    },
  })
  exigir(d.pessoaId === ctx.ator.pessoaId && d.registradaPorId !== d.pessoaId, 'SEM_PERMISSAO')
  exigir(!d.revogadaEm, 'ENTRADA_INVALIDA', 'Já revogada.')
  const rodadaId =
    d.rodadaId ??
    (d.cicloId
      ? (
          await db.rodada.findFirstOrThrow({
            where: { cicloId: d.cicloId, sequencia: 1 },
            select: { id: true },
          })
        ).id
      : null)
  exigir(rodadaId, 'ENTRADA_INVALIDA', 'Este ato não se revoga.')
  return emTransacao(async (tx) => {
    await travar(tx, `rodada:${rodadaId}`)
    const r = await tx.rodada.findUniqueOrThrow({
      where: { id: rodadaId },
      select: { status: true },
    })
    exigir(r.status === 'AGENDADA', 'RODADA_ENCERRADA') // o corte já passou
    await tx.declaracao.update({ where: { id: e.declaracaoId }, data: { revogadaEm: ctx.agora } })
    await registrarEvento(tx, ctx, {
      acao: 'declaracao.revogar',
      entidade: 'declaracao',
      entidadeId: e.declaracaoId,
    })
  })
}

/** Pendência do sujeito: atos transcritos em seu nome ainda revogáveis (07 §4). */
export async function transcritosParaMim(pessoaId: string) {
  const atos = await db.declaracao.findMany({
    where: {
      pessoaId,
      revogadaEm: null,
      NOT: { registradaPorId: pessoaId },
      OR: [
        { tipo: 'NAO_CONCORRER', rodada: { status: 'AGENDADA' } },
        {
          tipo: { in: ['CONFIRMA_PROXIMO_CICLO', 'RECUSA_PROXIMO_CICLO'] },
          ciclo: { status: 'PLANEJADO' },
        },
      ],
    },
    select: { id: true, tipo: true, efetivaEm: true, registradaPorId: true },
    orderBy: { registradaEm: 'desc' },
  })
  const autores = await db.pessoa.findMany({
    where: { id: { in: atos.map((a) => a.registradaPorId) } },
    select: { id: true, apelido: true },
  })
  return atos.map((a) => ({
    ...a,
    transcritoPor: autores.find((p) => p.id === a.registradaPorId)?.apelido ?? '—',
  }))
}

/** Opções do formulário de transcrição na página do membro (07 §3.11). */
export async function opcoesDeTranscricao(pessoaId: string) {
  const [rodadas, ciclo, obrigacoes] = await Promise.all([
    db.rodada.findMany({
      where: { status: 'AGENDADA', ciclo: { status: { in: ['EM_ANDAMENTO', 'PLANEJADO'] } } },
      orderBy: { agendadaPara: 'asc' },
      take: 2,
      select: {
        id: true,
        sequencia: true,
        mesReferencia: true,
        ciclo: { select: { numero: true } },
      },
    }),
    db.ciclo.findFirst({ where: { status: 'PLANEJADO' }, select: { id: true, numero: true } }),
    db.obrigacao.findMany({
      where: { devedorId: pessoaId, canceladaEm: null, autoquitada: false, justificadaEm: null },
      orderBy: { vencimentoEm: 'desc' },
      take: 10,
      select: {
        id: true,
        tipo: true,
        valorCentavos: true,
        vencimentoEm: true,
        credor: { select: { apelido: true } },
      },
    }),
  ])
  return { rodadas, ciclo, obrigacoes }
}
