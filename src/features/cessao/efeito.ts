import 'server-only'

import { dataLocal, fimDoDia } from '@/domain/tempo'
import { CONTA, criarDerivada, REDIRECIONAVEIS } from '@/features/financeiro/derivadas'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'
import { travar } from '@/server/tx'

/**
 * RN-CES-05: efeitos da aprovação, na transação da ATA e **nesta ordem** (evita violar
 * obrigacao_partes e contribuicao_por_devedor). Devolve o texto do resultado para a ATA.
 */
export async function aplicarCessao(
  tx: Tx,
  ctx: Contexto,
  cessaoId: string,
  ataNumero: number,
  t: Date,
): Promise<string> {
  const previa = await tx.cessao.findUnique({ where: { id: cessaoId }, select: { rodadaId: true } })
  if (!previa) return 'não aplicável: cessão inexistente'
  await travar(tx, `rodada:${previa.rodadaId}`)
  const c = await tx.cessao.findUniqueOrThrow({
    where: { id: cessaoId },
    include: {
      rodada: { select: { status: true, contempladoId: true } },
      beneficiario: { select: { nome: true, apelido: true } },
    },
  })
  const vale =
    c.status === 'EM_VOTACAO' &&
    c.rodada.status === 'CONTEMPLADA' &&
    c.rodada.contempladoId === c.cedenteId
  if (!vale) {
    if (c.status === 'EM_VOTACAO') {
      await tx.cessao.update({ where: { id: c.id }, data: { status: 'CANCELADA', encerradaEm: t } })
    }
    return 'não aplicável: a rodada não admite mais a cessão'
  }
  const { rodadaId, cedenteId: A, beneficiarioId: B } = c
  const fimDaAta = fimDoDia(dataLocal(t))
  const cancelar = { canceladaEm: t, motivoCancelamento: 'cessao', ataNumero }
  const ctxAta = { ...ctx, agora: t }

  // 1. o beneficiário passa a ser o contemplado (o cedente volta a NC na rodada seguinte)
  await tx.rodada.update({ where: { id: rodadaId }, data: { contempladoId: B } })

  // 2. obrigações do beneficiário na rodada: canceladas; CONTRIBUICAO/SOBRA renascem autoquitadas;
  //    o que ele já pagou ao cedente volta como DEVOLUCAO (CA-48)
  const doBeneficiario = await tx.obrigacao.findMany({
    where: { rodadaId, devedorId: B, canceladaEm: null, tipo: { in: REDIRECIONAVEIS } },
    include: {
      pagamentos: {
        where: { ...CONTA, recebedorId: A },
        select: { id: true, valorCentavos: true },
      },
    },
  })
  await tx.obrigacao.updateMany({
    where: { id: { in: doBeneficiario.map((o) => o.id) } },
    data: cancelar,
  })
  const renascidas = doBeneficiario.filter((o) => o.tipo !== 'REPASSE_CESSAO')
  await tx.obrigacao.createMany({
    data: renascidas.map((o) => ({
      tipo: o.tipo,
      rodadaId,
      rodadaOrigemId: o.rodadaOrigemId,
      aquisicaoReembolsoId: o.aquisicaoReembolsoId,
      devedorId: B,
      credorId: B,
      valorCentavos: o.valorCentavos,
      vencimentoEm: o.vencimentoEm,
      autoquitada: true,
      criadaEm: t,
      ataNumero,
    })),
  })
  const pagosAoCedente = doBeneficiario.flatMap((o) => o.pagamentos)
  await Promise.all(
    pagosAoCedente.map((p) =>
      criarDerivada(tx, ctxAta, {
        tipo: 'DEVOLUCAO',
        rodadaId,
        devedorId: A,
        credorId: B,
        valorCentavos: p.valorCentavos,
        pagamentoOrigemId: p.id,
        ataNumero,
      }),
    ),
  )

  // 3. autoquitadas do cedente: renascem cedente → beneficiário
  const doCedente = await tx.obrigacao.findMany({
    where: {
      rodadaId,
      devedorId: A,
      credorId: A,
      autoquitada: true,
      canceladaEm: null,
      tipo: { in: ['CONTRIBUICAO', 'SOBRA'] },
    },
  })
  await tx.obrigacao.updateMany({
    where: { id: { in: doCedente.map((o) => o.id) } },
    data: cancelar,
  })
  await tx.obrigacao.createMany({
    data: doCedente.map((o) => ({
      tipo: o.tipo,
      rodadaId,
      rodadaOrigemId: o.rodadaOrigemId,
      aquisicaoReembolsoId: o.aquisicaoReembolsoId,
      devedorId: A,
      credorId: B,
      valorCentavos: o.valorCentavos,
      vencimentoEm: o.vencimentoEm > fimDaAta ? o.vencimentoEm : fimDaAta,
      criadaEm: t,
      ataNumero,
    })),
  })

  // 4. redirecionamento: o credor passa a ser o beneficiário; pagamentos já feitos seguem com A
  const { count: redirecionadas } = await tx.obrigacao.updateMany({
    where: {
      rodadaId,
      tipo: { in: REDIRECIONAVEIS },
      canceladaEm: null,
      autoquitada: false,
      credorId: A,
    },
    data: { credorId: B },
  })

  // 5. repasse do que o cedente recebeu (exceto o do item 2; DEVOLUCAO nunca entra)
  const recebidos = await tx.pagamento.findMany({
    where: {
      ...CONTA,
      recebedorId: A,
      id: { notIn: pagosAoCedente.map((p) => p.id) },
      obrigacao: { rodadaId, tipo: { in: REDIRECIONAVEIS }, canceladaEm: null },
      obrigacoesDerivadas: { none: { canceladaEm: null } },
    },
    select: { id: true, valorCentavos: true },
  })
  await Promise.all(
    recebidos.map((p) =>
      criarDerivada(tx, ctxAta, {
        tipo: 'REPASSE_CESSAO',
        rodadaId,
        devedorId: A,
        credorId: B,
        valorCentavos: p.valorCentavos,
        pagamentoOrigemId: p.id,
        ataNumero,
      }),
    ),
  )

  // 7. avisos do cedente perdem efeito (vetos abertos sobre eles continuam)
  await tx.avisoCompra.updateMany({
    where: { rodadaId, substituidoEm: null },
    data: { substituidoEm: t },
  })
  // 8. prazoCompraAte não muda (art. 20)
  await tx.cessao.update({ where: { id: c.id }, data: { status: 'APROVADA', encerradaEm: t } })
  await registrarEvento(tx, ctxAta, {
    acao: 'efeito.cessao_vez',
    entidade: 'cessao',
    entidadeId: c.id,
    ataNumero,
    dados: {
      depois: {
        contempladoId: B,
        canceladas: doBeneficiario.length + doCedente.length,
        redirecionadas,
        devolucoes: pagosAoCedente.length,
        repasses: recebidos.length,
      },
    },
  })
  const nome = c.beneficiario.nome ?? c.beneficiario.apelido
  return `aplicado: ${nome} passa a ser o contemplado da rodada`
}
