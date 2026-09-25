import 'server-only'

import type { Parametros } from '@/domain/regulamento'
import {
  dataLocal,
  instanteLocal,
  mesDe,
  paraDb,
  primeiroDiaApos,
  somarDiasCorridos,
} from '@/domain/tempo'
import { ratearPendentesDoCiclo } from '@/features/compra/fechamento'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/** "AAAA-MM" do mês seguinte. */
export function mesSeguinte(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  return m === 12 ? `${String(a + 1)}-01` : `${String(a)}-${doisDigitos(m + 1)}`
}

/** RN-SOR-01: diaSorteio do mês às horaSorteio (SP), pela versão vigente. */
export const agendamento = (mes: string, p: Parametros): Date =>
  instanteLocal(`${mes}-${doisDigitos(p.diaSorteio)}`, p.horaSorteio)

/**
 * RN-SOR-10.4: regra única de criação da próxima rodada (também na RN-SOR-11). Não duplica se
 * já existir no ciclo rodada não ANULADA/CANCELADA com a sequência seguinte.
 */
export async function criarProximaRodada(
  tx: Tx,
  ctx: Contexto,
  r: { cicloId: string; sequencia: number; mesReferencia: string },
  p: Parametros,
): Promise<void> {
  const sequencia = r.sequencia + 1
  const existe = await tx.rodada.findFirst({
    where: { cicloId: r.cicloId, sequencia, status: { notIn: ['ANULADA', 'CANCELADA'] } },
    select: { id: true },
  })
  if (existe) return
  const mesReferencia = mesSeguinte(r.mesReferencia)
  const nova = await tx.rodada.create({
    data: {
      cicloId: r.cicloId,
      sequencia,
      mesReferencia,
      agendadaPara: agendamento(mesReferencia, p),
    },
    select: { id: true },
  })
  await registrarEvento(tx, ctx, {
    acao: 'rodada.agendar',
    entidade: 'rodada',
    entidadeId: nova.id,
    dados: { depois: { sequencia, mesReferencia } },
  })
}

/**
 * RN-CIC-04: NC vazio conclui o ciclo. Com semCicloSeguinte, ENCERRADO; senão EM_REVISAO e
 * nasce o ciclo seguinte no primeiro dia 3 ≥ conclusão + 8 dias (janela de ≥ 7 dias, D-17).
 */
export async function concluirCiclo(
  tx: Tx,
  ctx: Contexto,
  ciclo: { id: string; numero: number; semCicloSeguinte: boolean },
  p: Parametros,
): Promise<void> {
  const T = ctx.agora
  await tx.rodada.updateMany({
    where: { cicloId: ciclo.id, status: 'AGENDADA' },
    data: { status: 'CANCELADA' },
  })
  if (ciclo.semCicloSeguinte) {
    await tx.ciclo.update({
      where: { id: ciclo.id },
      data: { status: 'ENCERRADO', concluidoEm: T, encerradoEm: T },
    })
    await ratearPendentesDoCiclo(tx, ctx, ciclo.id) // RN-FIN-17
  } else {
    await tx.ciclo.update({
      where: { id: ciclo.id },
      data: { status: 'EM_REVISAO', concluidoEm: T },
    })
    const dataInicio = primeiroDiaApos(somarDiasCorridos(dataLocal(T), 7), p.diaSorteio)
    const seguinte = await tx.ciclo.create({
      data: {
        numero: ciclo.numero + 1,
        dataInicio: paraDb(dataInicio),
        status: 'PLANEJADO',
        rodadas: {
          create: {
            sequencia: 1,
            mesReferencia: mesDe(dataInicio),
            agendadaPara: instanteLocal(dataInicio, p.horaSorteio),
          },
        },
      },
      select: { id: true },
    })
    await registrarEvento(tx, ctx, {
      acao: 'ciclo.criar',
      entidade: 'ciclo',
      entidadeId: seguinte.id,
      dados: { depois: { numero: ciclo.numero + 1, dataInicio } },
    })
  }
  await registrarEvento(tx, ctx, {
    acao: 'ciclo.concluir',
    entidade: 'ciclo',
    entidadeId: ciclo.id,
    dados: { depois: { semCicloSeguinte: ciclo.semCicloSeguinte } },
  })
}

/**
 * RN-CIC-02/03/06/07/08: corte da 1ª rodada de um ciclo PLANEJADO. Os previstos viram
 * participantes; com menos de 2, o ciclo é cancelado. Devolve false quando cancelou.
 */
export async function iniciarCiclo(
  tx: Tx,
  ctx: Contexto,
  ciclo: { id: string; numero: number },
  p: Parametros,
): Promise<boolean> {
  const T = ctx.agora
  const aptos = { status: { in: ['ATIVO' as const, 'IMPOSSIBILITADO' as const] } }
  const membros =
    ciclo.numero === 1
      ? await tx.membro.findMany({
          where: { origem: 'FUNDADOR', ...aptos },
          select: { id: true, pessoaId: true },
        })
      : await tx.membro.findMany({ where: aptos, select: { id: true, pessoaId: true } })
  let previstos = membros
  if (ciclo.numero > 1) {
    const confirmaram = new Set(
      (
        await tx.declaracao.findMany({
          where: {
            tipo: 'CONFIRMA_PROXIMO_CICLO',
            cicloId: ciclo.id,
            revogadaEm: null,
            pessoaId: { in: membros.map((m) => m.pessoaId) },
          },
          select: { pessoaId: true },
        })
      ).map((d) => d.pessoaId),
    )
    previstos = membros.filter((m) => confirmaram.has(m.pessoaId))
    // RN-CIC-06: quem não confirmou encerra agora, sem saiuEm (a família não muda)
    const naoConfirmaram = membros.filter((m) => !confirmaram.has(m.pessoaId))
    if (naoConfirmaram.length > 0) {
      await tx.membro.updateMany({
        where: { id: { in: naoConfirmaram.map((m) => m.id) } },
        data: { status: 'ENCERRADO', encerradoEm: T, motivoEncerramento: 'NAO_CONFIRMOU_ART44' },
      })
    }
    previstos = [...previstos, ...(await ativarAdmitidos(tx, T, previstos.length, p))]
  }

  const anterior = await tx.ciclo.findFirst({
    where: { numero: ciclo.numero - 1, status: 'EM_REVISAO' },
    select: { id: true },
  })
  if (previstos.length < 2) {
    await semCicloSeguinte(
      tx,
      ctx,
      ciclo.id,
      `${String(previstos.length)} participante(s) no corte (RN-CIC-07)`,
    )
    return false
  }

  await tx.participacaoCiclo.createMany({
    data: previstos.map((m) => ({ cicloId: ciclo.id, pessoaId: m.pessoaId, entrouEm: T })),
  })
  await tx.ciclo.update({ where: { id: ciclo.id }, data: { status: 'EM_ANDAMENTO' } })
  if (anterior) {
    await tx.ciclo.update({
      where: { id: anterior.id },
      data: { status: 'ENCERRADO', encerradoEm: T },
    })
  }
  await registrarEvento(tx, ctx, {
    acao: 'ciclo.iniciar',
    entidade: 'ciclo',
    entidadeId: ciclo.id,
    dados: { depois: { participantes: previstos.length } },
  })
  return true
}

/**
 * RN-CIC-07: o ciclo PLANEJADO é cancelado com a rodada 1; o anterior (EM_REVISAO) encerra sem
 * ciclo seguinte e as SOBRAs pendentes são rateadas (RN-FIN-17).
 */
export async function semCicloSeguinte(
  tx: Tx,
  ctx: Contexto,
  planejadoId: string,
  motivo: string,
  ataNumero?: number,
): Promise<void> {
  const planejado = await tx.ciclo.findUniqueOrThrow({
    where: { id: planejadoId },
    select: { numero: true },
  })
  await tx.rodada.updateMany({
    where: { cicloId: planejadoId, status: 'AGENDADA' },
    data: { status: 'CANCELADA' },
  })
  await tx.ciclo.update({ where: { id: planejadoId }, data: { status: 'CANCELADO' } })
  const anterior = await tx.ciclo.findFirst({
    where: { numero: planejado.numero - 1, status: 'EM_REVISAO' },
    select: { id: true },
  })
  if (anterior) {
    await tx.ciclo.update({
      where: { id: anterior.id },
      data: {
        status: 'ENCERRADO',
        encerradoEm: ctx.agora,
        semCicloSeguinte: true,
        ...(ataNumero ? { ataEncerramentoNumero: ataNumero } : {}),
      },
    })
    await ratearPendentesDoCiclo(tx, ctx, anterior.id)
  }
  await registrarEvento(tx, ctx, {
    acao: 'ciclo.cancelar',
    entidade: 'ciclo',
    entidadeId: planejadoId,
    dados: { motivo },
    ...(ataNumero ? { ataNumero } : {}),
  })
}

/**
 * RN-CAD-12.4/5/6 e RN-CAD-13, no corte da 1ª rodada: admitido que assinou e já está na família
 * fica ATIVO, até `membrosPrevistos` (os demais ficam para o ciclo seguinte); quem não assinou
 * caduca, com o convite da mesma ATA. Devolve os ativados, que viram participantes.
 */
async function ativarAdmitidos(tx: Tx, T: Date, confirmados: number, p: Parametros) {
  const admitidos = await tx.membro.findMany({
    where: { origem: 'ADMISSAO', status: { in: ['AGUARDANDO_ADESAO', 'AGUARDANDO_CICLO'] } },
    orderBy: [{ ataAdmissaoNumero: 'asc' }, { criadoEm: 'asc' }],
    select: {
      id: true,
      pessoaId: true,
      status: true,
      ataAdmissaoNumero: true,
      pessoa: { select: { integrantes: { where: { status: 'ATIVO' }, select: { id: true } } } },
    },
  })
  const caducos = admitidos.filter((a) => a.status === 'AGUARDANDO_ADESAO')
  if (caducos.length > 0) {
    await tx.membro.updateMany({
      where: { id: { in: caducos.map((a) => a.id) } },
      data: { status: 'ENCERRADO', encerradoEm: T, motivoEncerramento: 'ADMISSAO_CADUCOU' },
    })
    await tx.integranteFamilia.updateMany({
      where: {
        status: 'CONVITE_AUTORIZADO',
        OR: caducos.map((a) => ({ pessoaId: a.pessoaId, ataConviteNumero: a.ataAdmissaoNumero })),
      },
      data: { status: 'CONVITE_CADUCOU' },
    })
  }
  // RN-CAD-12.6: sem o convite executado na Steam, fica para o ciclo seguinte (pendência)
  const prontos = admitidos.filter(
    (a) => a.status === 'AGUARDANDO_CICLO' && a.pessoa.integrantes.length > 0,
  )
  const ativados = prontos.slice(0, Math.max(0, p.membrosPrevistos - confirmados)) // CA-94
  if (ativados.length > 0) {
    await tx.membro.updateMany({
      where: { id: { in: ativados.map((a) => a.id) } },
      data: { status: 'ATIVO', ativadoEm: T },
    })
  }
  return ativados.map((a) => ({ id: a.id, pessoaId: a.pessoaId }))
}
