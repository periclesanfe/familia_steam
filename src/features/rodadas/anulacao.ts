import 'server-only'

import { parametrosSchema, versaoVigente } from '@/domain/regulamento'
import { dataLocal, instanteLocal, somarDiasCorridos } from '@/domain/tempo'
import { CONTA, criarDerivada } from '@/features/financeiro/derivadas'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'
import { travar } from '@/server/tx'

const naoAplicavel = (motivo: string) => `não aplicável: ${motivo}`

/**
 * RN-SOR-13 (arts. 9º e 43; D-28): anulação por ATA de caso omisso, na transação da ATA. Sem
 * aquisição, com o ciclo em andamento e nenhuma rodada posterior já executada; senão, a correção
 * segue por CANCELAR_OBRIGACAO/CRIAR_DEVOLUCAO.
 */
export async function anularRodada(
  tx: Tx,
  ctx: Contexto,
  rodadaId: string,
  ataNumero: number,
  t: Date,
): Promise<string> {
  await travar(tx, `rodada:${rodadaId}`)
  const r = await tx.rodada.findUnique({
    where: { id: rodadaId },
    select: {
      status: true,
      cicloId: true,
      sequencia: true,
      mesReferencia: true,
      ciclo: { select: { status: true } },
      _count: { select: { aquisicoes: true } },
    },
  })
  if (!r) return naoAplicavel('rodada inexistente')
  if (r.status !== 'CONTEMPLADA' && r.status !== 'SEM_CONTEMPLADO')
    return naoAplicavel('só se anula rodada sorteada e ainda aberta')
  if (r._count.aquisicoes > 0) return naoAplicavel('a rodada tem aquisição')
  if (r.ciclo.status !== 'EM_ANDAMENTO') return naoAplicavel('o ciclo não está em andamento') // CA-152
  const posteriores = await tx.rodada.count({
    where: {
      cicloId: r.cicloId,
      sequencia: { gt: r.sequencia },
      status: { in: ['CONTEMPLADA', 'SEM_CONTEMPLADO', 'FECHADA'] },
    },
  })
  if (posteriores > 0) return naoAplicavel('uma rodada posterior já foi sorteada') // CA-152

  // 1–2. a original fica ANULADA (visível); a substituta, mesma sequência e mês, no dia seguinte
  await tx.rodada.update({ where: { id: rodadaId }, data: { status: 'ANULADA' } })
  const versoes = await tx.versaoRegulamento.findMany({
    select: { ordem: true, vigenteDesde: true, parametros: true },
  })
  const p = parametrosSchema.parse(versaoVigente(versoes, t)?.parametros)
  const substituta = await tx.rodada.create({
    data: {
      cicloId: r.cicloId,
      sequencia: r.sequencia,
      mesReferencia: r.mesReferencia,
      agendadaPara: instanteLocal(somarDiasCorridos(dataLocal(t), 1), p.horaSorteio), // CA-141
      rodadaAnuladaId: rodadaId,
    },
    select: { id: true },
  })

  // 3–4. obrigações da anulada canceladas (menos DEVOLUCAO); o que foi pago volta
  const obrigacoes = await tx.obrigacao.findMany({
    where: { rodadaId, canceladaEm: null, tipo: { not: 'DEVOLUCAO' } },
    select: {
      id: true,
      devedorId: true,
      pagamentos: { where: CONTA, select: { id: true, recebedorId: true, valorCentavos: true } },
    },
  })
  await tx.obrigacao.updateMany({
    where: { id: { in: obrigacoes.map((o) => o.id) } },
    data: { canceladaEm: t, motivoCancelamento: 'anulacao', ataNumero },
  })
  const ctxAta = { ...ctx, agora: t }
  const devolucoes = obrigacoes.flatMap((o) =>
    o.pagamentos.map((pg) => ({ ...pg, devedorId: o.devedorId })),
  )
  await Promise.all(
    devolucoes.map((pg) =>
      criarDerivada(tx, ctxAta, {
        tipo: 'DEVOLUCAO',
        rodadaId,
        devedorId: pg.recebedorId,
        credorId: pg.devedorId,
        valorCentavos: pg.valorCentavos,
        pagamentoOrigemId: pg.id,
        ataNumero,
      }),
    ),
  )
  // 5. SOBRAs canceladas voltam a ficar pendentes: renascem na próxima contemplação (RN-FIN-14/16)

  // 6. declarações não revogadas da anulada valem na substituta (revogáveis até o novo corte)
  const declaracoes = await tx.declaracao.findMany({
    where: {
      rodadaId,
      revogadaEm: null,
      tipo: { in: ['NAO_CONCORRER', 'JUSTIFICATIVA_PRORROGACAO'] },
    },
  })
  await tx.declaracao.createMany({
    data: declaracoes.map((d) => ({
      tipo: d.tipo,
      pessoaId: d.pessoaId,
      rodadaId: substituta.id,
      texto: d.texto,
      efetivaEm: d.efetivaEm,
      registradaEm: d.registradaEm,
      registradaPorId: d.registradaPorId,
      evidenciaAnexoId: d.evidenciaAnexoId,
    })),
  })

  // 7. avisos e cessões da anulada perdem efeito (vetos seguem)
  await tx.avisoCompra.updateMany({
    where: { rodadaId, substituidoEm: null },
    data: { substituidoEm: t },
  })
  await tx.cessao.updateMany({
    where: { rodadaId, status: { in: ['AGUARDANDO_ACEITE', 'EM_VOTACAO'] } },
    data: { status: 'CANCELADA', encerradaEm: t },
  })

  await registrarEvento(tx, ctxAta, {
    acao: 'efeito.anular_rodada',
    entidade: 'rodada',
    entidadeId: rodadaId,
    ataNumero,
    dados: {
      depois: {
        substitutaId: substituta.id,
        canceladas: obrigacoes.length,
        devolucoes: devolucoes.length,
        declaracoesCopiadas: declaracoes.length,
      },
    },
  })
  const dia = somarDiasCorridos(dataLocal(t), 1).split('-').reverse().join('/')
  return `aplicado: rodada anulada; novo sorteio em ${dia} às ${p.horaSorteio}`
}
