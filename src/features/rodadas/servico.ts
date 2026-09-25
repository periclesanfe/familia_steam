import 'server-only'

import { randomInt } from 'node:crypto'

import { ErroDeNegocio, exigir } from '@/domain/erros'
import type { ContribuicaoFato } from '@/domain/financeiro'
import { hashSnapshot } from '@/domain/hash'
import { parametrosSchema, versaoVigente } from '@/domain/regulamento'
import { ALGORITMO_VERSAO, apurarSorteio } from '@/domain/sorteio'
import { dataLocal, fimDoDia, paraDb, prazoEmDias } from '@/domain/tempo'
import type { ContextoAcao } from '@/server/acao'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'
import { agora } from '@/server/relogio'
import { emTransacao, travar } from '@/server/tx'

import { concluirCiclo, criarProximaRodada, iniciarCiclo } from './ciclo'

export type ResultadoExecucao = { rodadaId: string; executada: boolean; status: string }

const rngSeguro = (n: number) => randomInt(0, n)

/**
 * RN-SOR-02..11: executa o sorteio de uma rodada AGENDADA, pelo tick (SISTEMA) ou pelo botão
 * "Realizar sorteio" (qualquer membro). Uma execução por rodada: o 2º disparo só devolve o status.
 */
export async function executarRodada(
  rodadaId: string,
  disparadoPorId: string | null,
  rng: (n: number) => number = rngSeguro,
): Promise<ResultadoExecucao> {
  return emTransacao(async (tx) => {
    // RN-GER-06: 'fechamento' sempre primeiro (a contemplação liga SOBRA pendente, RN-SOR-10.3)
    await travar(tx, 'fechamento')
    await travar(tx, `rodada:${rodadaId}`)
    const T = agora() // RN-SOR-03: o corte é lido depois do lock
    const ctx: Contexto = {
      ator: disparadoPorId ? { tipo: 'MEMBRO', pessoaId: disparadoPorId } : { tipo: 'SISTEMA' },
      agora: T,
    }

    const rodada = await tx.rodada.findUniqueOrThrow({
      where: { id: rodadaId },
      include: { ciclo: true },
    })
    if (rodada.status !== 'AGENDADA') return { rodadaId, executada: false, status: rodada.status }
    exigir(T >= rodada.agendadaPara, 'SORTEIO_ANTES_DO_HORARIO') // CA-22
    const pendenteAntes = await tx.rodada.count({
      where: { cicloId: rodada.cicloId, status: 'AGENDADA', sequencia: { lt: rodada.sequencia } },
    })
    exigir(pendenteAntes === 0, 'SORTEIO_FORA_DE_ORDEM')

    const versoes = await tx.versaoRegulamento.findMany({
      select: { id: true, ordem: true, vigenteDesde: true, parametros: true },
    })
    const versao = versaoVigente(versoes, T)
    if (!versao) throw new ErroDeNegocio('REGULAMENTO_NAO_VIGENTE')
    const p = parametrosSchema.parse(versao.parametros)

    if (rodada.ciclo.status === 'PLANEJADO') {
      const iniciou = await iniciarCiclo(tx, ctx, rodada.ciclo, rodada.id)
      if (!iniciou) return { rodadaId, executada: false, status: 'CANCELADA' }
    }
    if (rodada.ciclo.status !== 'PLANEJADO' && rodada.ciclo.status !== 'EM_ANDAMENTO') {
      throw new Error(`ciclo ${rodada.ciclo.status} com rodada AGENDADA (RN-CIC-04)`)
    }

    const entrada = await carregarEntrada(tx, rodada.cicloId, rodada.id, T)
    const apuracao = apurarSorteio(entrada, T, rng)
    const r = apuracao.resultado

    await tx.sorteio.create({
      data: {
        rodadaId,
        corteEm: T,
        disparadoPorId,
        algoritmoVersao: ALGORITMO_VERSAO,
        snapshot: apuracao.snapshot as object,
        snapshotSha256: hashSnapshot(apuracao.snapshot),
        elegiveisIds: apuracao.elegiveisIds,
        indice: apuracao.indice,
        contempladoId: r.tipo === 'CONTEMPLADA' ? r.contempladoId : null,
      },
    })

    // RN-SOR-04: depois do fim do dia agendado, atrasada; prazos contam da data do corte
    const dataSorteio = dataLocal(T)
    const atrasada = T >= fimDoDia(dataLocal(rodada.agendadaPara))
    const comum = {
      executadaEm: T,
      dataSorteio: paraDb(dataSorteio),
      atrasada,
      versaoRegulamentoId: versao.id,
    }

    if (r.tipo === 'SEM_CONTEMPLADO') {
      // RN-SOR-11: sem obrigação nem prazo; o ciclo ganha um mês
      await tx.rodada.update({
        where: { id: rodadaId },
        data: { ...comum, status: 'SEM_CONTEMPLADO', motivoSemContemplado: r.motivo },
      })
      await criarProximaRodada(tx, ctx, rodada, p)
    } else {
      // RN-SOR-10.1
      await tx.rodada.update({
        where: { id: rodadaId },
        data: {
          ...comum,
          status: 'CONTEMPLADA',
          tipoContemplacao: r.tipoContemplacao,
          sorteadoOriginalId: r.contempladoId,
          contempladoId: r.contempladoId,
          contribuicaoCentavos: p.contribuicaoCentavos,
          prazoCompraAte: prazoEmDias(dataSorteio, p.diasPrazoCompra),
        },
      })
      // RN-SOR-10.2 / RN-FIN-02
      const pagantes = await gerarContribuicoes(
        tx,
        rodada,
        r.contempladoId,
        dataSorteio,
        p.contribuicaoCentavos,
        T,
      )
      await tx.rodada.update({ where: { id: rodadaId }, data: { pagantesNoCorte: pagantes } })
      // RN-SOR-10.3: SOBRA pendente — ponytail: entra no M7 (ainda não há SOBRA sem destino)

      // RN-SOR-10.4
      const ncDepois = new Set(
        entrada.participantes.filter((x) => !x.saiuEm || x.saiuEm > T).map((x) => x.pessoaId),
      )
      for (const id of [...entrada.contempladosIds, r.contempladoId]) ncDepois.delete(id)
      if (ncDepois.size === 0) await concluirCiclo(tx, ctx, rodada.ciclo, p)
      else await criarProximaRodada(tx, ctx, rodada, p)
    }

    await registrarEvento(tx, ctx, {
      acao: 'rodada.sortear',
      entidade: 'rodada',
      entidadeId: rodadaId,
      dados: { depois: { resultado: r, atrasada, dataSorteio } },
    })
    return { rodadaId, executada: true, status: r.tipo }
  })
}

/** Fatos do corte para o domínio, em número fixo de consultas (13 DP-03). */
export async function carregarEntrada(
  tx: Tx, // também o db, na prévia da elegibilidade
  cicloId: string,
  rodadaId: string,
  T: Date,
) {
  const [participacoes, rodadas, declaracoes] = await Promise.all([
    tx.participacaoCiclo.findMany({
      where: { cicloId },
      select: {
        pessoaId: true,
        entrouEm: true,
        saiuEm: true,
        pessoa: {
          select: {
            nome: true,
            apelido: true,
            membros: { where: { status: { not: 'ENCERRADO' } }, select: { status: true } },
          },
        },
      },
    }),
    tx.rodada.findMany({
      where: { cicloId, status: { notIn: ['ANULADA', 'CANCELADA'] }, contempladoId: { not: null } },
      select: { contempladoId: true },
    }),
    tx.declaracao.findMany({
      where: {
        tipo: 'NAO_CONCORRER',
        rodadaId,
        registradaEm: { lt: T },
        OR: [{ revogadaEm: null }, { revogadaEm: { gt: T } }],
      },
      select: { pessoaId: true },
    }),
  ])
  const ids = participacoes.map((x) => x.pessoaId)
  const obrigacoes = await tx.obrigacao.findMany({
    where: { tipo: 'CONTRIBUICAO', devedorId: { in: ids } },
    select: {
      id: true,
      devedorId: true,
      valorCentavos: true,
      vencimentoEm: true,
      justificadaEm: true,
      canceladaEm: true,
      autoquitada: true,
      rodada: { select: { cicloId: true, versaoRegulamento: { select: { parametros: true } } } },
      pagamentos: {
        select: { status: true, formaDiversa: true, valorCentavos: true, pixEm: true },
      },
    },
  })
  const contribuicoes: ContribuicaoFato[] = obrigacoes.map((o) => ({
    ...o,
    cicloId: o.rodada.cicloId,
    diasProrrogacao: parametrosSchema.parse(o.rodada.versaoRegulamento?.parametros).diasProrrogacao,
  }))
  const primeiroCorte = participacoes.reduce<Date>((m, x) => (x.entrouEm < m ? x.entrouEm : m), T)
  return {
    cicloId,
    participantes: participacoes.map((x) => ({
      pessoaId: x.pessoaId,
      nome: x.pessoa.nome ?? x.pessoa.apelido,
      entrouEm: x.entrouEm,
      saiuEm: x.saiuEm,
      impossibilitado: x.pessoa.membros.some((m) => m.status === 'IMPOSSIBILITADO'),
    })),
    contempladosIds: rodadas.flatMap((x) => (x.contempladoId ? [x.contempladoId] : [])),
    contribuicoes,
    naoConcorrem: declaracoes.map((d) => d.pessoaId),
    primeiroCorte,
  }
}

/**
 * RN-FIN-02: uma CONTRIBUICAO por pagante (a do contemplado autoquitada). Pagantes: participantes
 * em P no corte + quem saiu depois de contemplado neste ciclo; sem os que têm contribuições
 * suspensas. Justificativas antecipadas da rodada são copiadas (RN-FIN-03).
 */
async function gerarContribuicoes(
  tx: Tx,
  rodada: { id: string; cicloId: string },
  contempladoId: string,
  dataSorteio: string,
  valor: number,
  T: Date,
): Promise<number> {
  const [participacoes, contempladosDoCiclo, justificativas] = await Promise.all([
    tx.participacaoCiclo.findMany({
      where: { cicloId: rodada.cicloId, contribuicoesSuspensas: false },
      select: { pessoaId: true, entrouEm: true, saiuEm: true },
    }),
    tx.rodada.findMany({
      where: {
        cicloId: rodada.cicloId,
        status: { notIn: ['ANULADA', 'CANCELADA'] },
        contempladoId: { not: null },
      },
      select: { contempladoId: true },
    }),
    tx.declaracao.findMany({
      where: {
        tipo: 'JUSTIFICATIVA_PRORROGACAO',
        rodadaId: rodada.id,
        revogadaEm: null,
        registradaEm: { lt: T },
      },
      select: { pessoaId: true, texto: true, efetivaEm: true },
    }),
  ])
  const contemplados = new Set(contempladosDoCiclo.map((x) => x.contempladoId))
  const pagantes = participacoes.filter(
    (x) => x.entrouEm <= T && (!x.saiuEm || x.saiuEm > T || contemplados.has(x.pessoaId)),
  )
  const vencimentoEm = fimDoDia(dataSorteio)
  const justificativaDe = new Map(justificativas.map((j) => [j.pessoaId, j]))
  await tx.obrigacao.createMany({
    data: pagantes.map((x) => {
      const j = x.pessoaId === contempladoId ? undefined : justificativaDe.get(x.pessoaId)
      return {
        tipo: 'CONTRIBUICAO' as const,
        rodadaId: rodada.id,
        devedorId: x.pessoaId,
        credorId: contempladoId,
        valorCentavos: valor,
        vencimentoEm,
        autoquitada: x.pessoaId === contempladoId,
        justificativa: j?.texto ?? null,
        justificadaEm: j && j.efetivaEm < vencimentoEm ? j.efetivaEm : null,
        criadaEm: T,
      }
    }),
  })
  return pagantes.length
}

/** Rodada AGENDADA em que a pessoa pode declarar (participa, ou é prevista na rodada 1). */
async function exigirRodadaDeclaravel(tx: Tx, rodadaId: string, pessoaId: string) {
  await travar(tx, `rodada:${rodadaId}`)
  const rodada = await tx.rodada.findUniqueOrThrow({
    where: { id: rodadaId },
    select: {
      id: true,
      status: true,
      cicloId: true,
      sequencia: true,
      ciclo: { select: { status: true, numero: true } },
    },
  })
  exigir(rodada.status === 'AGENDADA', 'RODADA_ENCERRADA') // CA-06: depois do corte, recusada
  const participa =
    rodada.ciclo.status === 'PLANEJADO'
      ? await tx.membro.count({
          where: {
            pessoaId,
            status: { in: ['ATIVO', 'IMPOSSIBILITADO'] },
            ...(rodada.ciclo.numero === 1 ? { origem: 'FUNDADOR' as const } : {}),
          },
        })
      : await tx.participacaoCiclo.count({
          where: { cicloId: rodada.cicloId, pessoaId, saiuEm: null },
        })
  exigir(participa > 0, 'NAO_PARTICIPA')
  return rodada
}

/** RN-SOR-12 (art. 12): não concorrer nesta rodada; revogável até o corte. */
export async function declararNaoConcorrer(ctx: ContextoAcao, e: { rodadaId: string }) {
  return emTransacao(async (tx) => {
    const rodada = await exigirRodadaDeclaravel(tx, e.rodadaId, ctx.ator.pessoaId)
    const [contemplado, participantes, contemplados, jaDeclarou] = await Promise.all([
      tx.rodada.count({
        where: {
          cicloId: rodada.cicloId,
          contempladoId: ctx.ator.pessoaId,
          status: { notIn: ['ANULADA', 'CANCELADA'] },
        },
      }),
      tx.participacaoCiclo.count({ where: { cicloId: rodada.cicloId, saiuEm: null } }),
      tx.rodada.count({
        where: {
          cicloId: rodada.cicloId,
          contempladoId: { not: null },
          status: { notIn: ['ANULADA', 'CANCELADA'] },
        },
      }),
      tx.declaracao.findFirst({
        where: {
          tipo: 'NAO_CONCORRER',
          rodadaId: rodada.id,
          pessoaId: ctx.ator.pessoaId,
          revogadaEm: null,
        },
        select: { id: true },
      }),
    ])
    exigir(contemplado === 0, 'NAO_PARTICIPA', 'Quem já foi contemplado não concorre.', 'art. 12')
    exigir(
      rodada.ciclo.status === 'PLANEJADO' || participantes - contemplados > 1,
      'ENTRADA_INVALIDA',
      'Com um único não contemplado, a contemplação é obrigatória.',
      'art. 14',
    )
    exigir(!jaDeclarou, 'ENTRADA_INVALIDA', 'Você já declarou que não vai concorrer.')
    const d = await tx.declaracao.create({
      data: {
        tipo: 'NAO_CONCORRER',
        pessoaId: ctx.ator.pessoaId,
        rodadaId: rodada.id,
        efetivaEm: ctx.agora,
        registradaEm: ctx.agora,
        registradaPorId: ctx.ator.pessoaId,
      },
      select: { id: true },
    })
    await registrarEvento(tx, ctx, {
      acao: 'declaracao.nao_concorrer',
      entidade: 'declaracao',
      entidadeId: d.id,
    })
  })
}

export async function revogarNaoConcorrer(ctx: ContextoAcao, e: { rodadaId: string }) {
  return emTransacao(async (tx) => {
    await exigirRodadaDeclaravel(tx, e.rodadaId, ctx.ator.pessoaId)
    const d = await tx.declaracao.findFirst({
      where: {
        tipo: 'NAO_CONCORRER',
        rodadaId: e.rodadaId,
        pessoaId: ctx.ator.pessoaId,
        revogadaEm: null,
      },
      select: { id: true },
    })
    exigir(d, 'NAO_ENCONTRADO', 'Não há declaração para revogar.')
    await tx.declaracao.update({ where: { id: d.id }, data: { revogadaEm: ctx.agora } })
    await registrarEvento(tx, ctx, {
      acao: 'declaracao.revogar',
      entidade: 'declaracao',
      entidadeId: d.id,
    })
  })
}

/** RN-FIN-03: justificativa antecipada (antes do sorteio), copiada para a contribuição. */
export async function justificarAntecipadamente(
  ctx: ContextoAcao,
  e: { rodadaId: string; texto: string },
) {
  return emTransacao(async (tx) => {
    const rodada = await exigirRodadaDeclaravel(tx, e.rodadaId, ctx.ator.pessoaId)
    const ja = await tx.declaracao.findFirst({
      where: {
        tipo: 'JUSTIFICATIVA_PRORROGACAO',
        rodadaId: rodada.id,
        pessoaId: ctx.ator.pessoaId,
        revogadaEm: null,
      },
      select: { id: true },
    })
    exigir(!ja, 'ENTRADA_INVALIDA', 'Você já justificou para esta rodada.')
    const d = await tx.declaracao.create({
      data: {
        tipo: 'JUSTIFICATIVA_PRORROGACAO',
        pessoaId: ctx.ator.pessoaId,
        rodadaId: rodada.id,
        texto: e.texto,
        efetivaEm: ctx.agora,
        registradaEm: ctx.agora,
        registradaPorId: ctx.ator.pessoaId,
      },
      select: { id: true },
    })
    await registrarEvento(tx, ctx, {
      acao: 'declaracao.justificar',
      entidade: 'declaracao',
      entidadeId: d.id,
    })
  })
}
