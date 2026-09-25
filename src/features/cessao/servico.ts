import 'server-only'

import { exigir } from '@/domain/erros'
import { somarHoras } from '@/domain/tempo'
import { abrirVotacao, fecharVotacao } from '@/features/votacoes/servico'
import type { ContextoAcao } from '@/server/acao'
import { registrarEvento } from '@/server/auditoria'
import { db, type Tx } from '@/server/db'
import { emTransacao, travar } from '@/server/tx'

const EM_ANDAMENTO = ['AGUARDANDO_ACEITE', 'EM_VOTACAO'] as const
const HORAS_CIENCIA = 96

/**
 * RN-CES-01/02: a rodada ainda admite cessão e o beneficiário é elegível.
 * ponytail: o alerta (sem bloqueio) para beneficiário postergado ou que optou por não concorrer
 * não é exibido; entra quando a aba Cessão mostrar a situação de cada um no sorteio.
 */
async function validarProposta(
  tx: Tx,
  agora: Date,
  e: { rodadaId: string; cedenteId: string; beneficiarioId: string; cienciaPrazo: boolean },
) {
  const r = await tx.rodada.findUniqueOrThrow({
    where: { id: e.rodadaId },
    select: {
      cicloId: true,
      status: true,
      contempladoId: true,
      tipoContemplacao: true,
      prazoCompraAte: true,
      _count: { select: { aquisicoes: true } },
    },
  })
  exigir(
    r.status === 'CONTEMPLADA' && r.contempladoId === e.cedenteId,
    'SEM_PERMISSAO',
    'Só o contemplado vigente de uma rodada aberta propõe cessão.',
    'art. 13',
  )
  exigir(
    r.tipoContemplacao !== 'OBRIGATORIA_ART14',
    'ENTRADA_INVALIDA',
    'Na contemplação obrigatória não há cessão.',
    'art. 14',
  ) // CA-50
  exigir(
    r._count.aquisicoes === 0,
    'ENTRADA_INVALIDA',
    'Já há compra registrada nesta rodada.',
    'art. 13',
  )
  exigir(
    r.prazoCompraAte && agora < r.prazoCompraAte,
    'ENTRADA_INVALIDA',
    'O prazo de compra já venceu.',
    'art. 20',
  )
  exigir(
    e.cienciaPrazo || somarHoras(agora, HORAS_CIENCIA) < r.prazoCompraAte,
    'ENTRADA_INVALIDA',
    'Faltam menos de 96 h para o prazo de compra: confirme a ciência de que ele não será prorrogado.',
    'art. 20',
  )
  const [participa, membro, contemplado] = await Promise.all([
    tx.participacaoCiclo.count({
      where: { cicloId: r.cicloId, pessoaId: e.beneficiarioId, saiuEm: null },
    }),
    tx.membro.findFirst({
      where: { pessoaId: e.beneficiarioId, status: { not: 'ENCERRADO' } },
      select: { status: true },
    }),
    tx.rodada.count({
      where: {
        cicloId: r.cicloId,
        contempladoId: e.beneficiarioId,
        status: { notIn: ['ANULADA', 'CANCELADA'] },
      },
    }),
  ])
  exigir(
    participa > 0 && contemplado === 0,
    'ENTRADA_INVALIDA',
    'O beneficiário precisa participar do ciclo e ainda não ter sido contemplado.',
    'art. 13',
  )
  exigir(
    membro?.status === 'ATIVO',
    'ENTRADA_INVALIDA',
    'O beneficiário está impossibilitado de pagar.',
    'art. 30',
  ) // CA-51
}

/** RN-CES-01/02: o contemplado vigente propõe; nasce AGUARDANDO_ACEITE. */
export async function proporCessao(
  ctx: ContextoAcao,
  e: { rodadaId: string; beneficiarioId: string; cienciaPrazo: boolean },
): Promise<{ cessaoId: string }> {
  return emTransacao(async (tx) => {
    await travar(tx, `rodada:${e.rodadaId}`)
    const cedenteId = ctx.ator.pessoaId
    await validarProposta(tx, ctx.agora, { ...e, cedenteId })
    const aberta = await tx.cessao.count({
      where: { rodadaId: e.rodadaId, status: { in: [...EM_ANDAMENTO] } },
    })
    exigir(aberta === 0, 'ENTRADA_INVALIDA', 'Já há uma cessão em andamento nesta rodada.') // CA-50
    const c = await tx.cessao.create({
      data: {
        rodadaId: e.rodadaId,
        cedenteId,
        beneficiarioId: e.beneficiarioId,
        status: 'AGUARDANDO_ACEITE',
        cienciaPrazo: e.cienciaPrazo,
        propostaEm: ctx.agora,
      },
      select: { id: true },
    })
    await registrarEvento(tx, ctx, {
      acao: 'cessao.propor',
      entidade: 'cessao',
      entidadeId: c.id,
      dados: { depois: { rodadaId: e.rodadaId, beneficiarioId: e.beneficiarioId } },
    })
    return { cessaoId: c.id }
  })
}

/**
 * RN-CES-03: só o beneficiário (sem transcrição) aceita ou recusa. O aceite revalida a proposta
 * e abre a votação CESSAO_VEZ com o cedente como convocante; a recusa cancela.
 */
export async function responderCessao(
  ctx: ContextoAcao,
  e: { cessaoId: string; aceitar: boolean },
): Promise<{ votacaoId?: string }> {
  return emTransacao(async (tx) => {
    const previa = await tx.cessao.findUniqueOrThrow({
      where: { id: e.cessaoId },
      select: { rodadaId: true },
    })
    await travar(tx, `rodada:${previa.rodadaId}`)
    const c = await tx.cessao.findUniqueOrThrow({
      where: { id: e.cessaoId },
      include: {
        cedente: { select: { nome: true, apelido: true } },
        beneficiario: { select: { nome: true, apelido: true } },
        rodada: { select: { sequencia: true, ciclo: { select: { numero: true } } } },
      },
    })
    exigir(c.beneficiarioId === ctx.ator.pessoaId, 'SEM_PERMISSAO')
    exigir(c.status === 'AGUARDANDO_ACEITE', 'ENTRADA_INVALIDA', 'Esta proposta já foi respondida.')
    if (!e.aceitar) {
      await tx.cessao.update({
        where: { id: c.id },
        data: { status: 'CANCELADA', encerradaEm: ctx.agora },
      })
      await registrarEvento(tx, ctx, {
        acao: 'cessao.recusar',
        entidade: 'cessao',
        entidadeId: c.id,
      })
      return {}
    }
    await validarProposta(tx, ctx.agora, c)
    const nome = (p: { nome: string | null; apelido: string }) => p.nome ?? p.apelido
    const { votacaoId } = await abrirVotacao(tx, ctx, c.cedenteId, {
      assunto: 'CESSAO_VEZ',
      proposicao: `${nome(c.cedente)} cede a vez da rodada ${String(c.rodada.sequencia)} do ciclo ${String(c.rodada.ciclo.numero)} a ${nome(c.beneficiario)}`,
      justificativa: 'Proposta do contemplado aceita pelo beneficiário (art. 13).',
      efeito: { tipo: 'CESSAO_VEZ', cessaoId: c.id },
    })
    await tx.cessao.update({
      where: { id: c.id },
      data: { status: 'EM_VOTACAO', aceitaEm: ctx.agora, votacaoId },
    })
    await registrarEvento(tx, ctx, {
      acao: 'cessao.aceitar',
      entidade: 'cessao',
      entidadeId: c.id,
      dados: { depois: { votacaoId } },
    })
    return { votacaoId }
  })
}

/**
 * RN-CES-03: o cedente retira a proposta até a aprovação, mesmo com votos de outros; a votação é
 * cancelada sem ATA (exceção à RN-VOT-05, D-12). Uma votação já decidida é encerrada antes.
 */
export async function retirarCessao(ctx: ContextoAcao, e: { cessaoId: string }): Promise<void> {
  const previa = await db.cessao.findUniqueOrThrow({
    where: { id: e.cessaoId },
    select: { rodadaId: true, votacaoId: true },
  })
  if (previa.votacaoId) await fecharVotacao(previa.votacaoId)
  return emTransacao(async (tx) => {
    if (previa.votacaoId) await travar(tx, `votacao:${previa.votacaoId}`)
    await travar(tx, `rodada:${previa.rodadaId}`)
    const c = await tx.cessao.findUniqueOrThrow({ where: { id: e.cessaoId } })
    exigir(c.cedenteId === ctx.ator.pessoaId, 'SEM_PERMISSAO')
    exigir(
      (EM_ANDAMENTO as readonly string[]).includes(c.status),
      'ENTRADA_INVALIDA',
      'A cessão já foi decidida.',
    )
    await tx.cessao.update({
      where: { id: c.id },
      data: { status: 'CANCELADA', encerradaEm: ctx.agora },
    })
    if (c.votacaoId) {
      await tx.votacao.update({
        where: { id: c.votacaoId },
        data: {
          status: 'CANCELADA',
          encerradaEm: ctx.agora,
          motivoEncerramento: 'CANCELADA_PELO_CONVOCANTE',
        },
      })
    }
    await registrarEvento(tx, ctx, {
      acao: 'cessao.retirar',
      entidade: 'cessao',
      entidadeId: c.id,
    })
  })
}
