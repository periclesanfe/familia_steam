import 'server-only'

import { apurarSorteio, type LinhaSnapshot } from '@/domain/sorteio'
import { deDb } from '@/domain/tempo'
import { db } from '@/server/db'
import { emTransacao } from '@/server/tx'

import { carregarEntrada } from './servico'

const apelidosDe = async (ids: string[]) =>
  new Map(
    (
      await db.pessoa.findMany({ where: { id: { in: ids } }, select: { id: true, apelido: true } })
    ).map((p) => [p.id, p.apelido]),
  )

/** Ciclo corrente: o EM_ANDAMENTO, senão o PLANEJADO mais recente, senão o último. */
async function cicloCorrente(numero?: number) {
  if (numero) return db.ciclo.findFirst({ where: { numero } })
  return (
    (await db.ciclo.findFirst({ where: { status: 'EM_ANDAMENTO' } })) ??
    (await db.ciclo.findFirst({ where: { status: 'PLANEJADO' }, orderBy: { numero: 'desc' } })) ??
    (await db.ciclo.findFirst({ orderBy: { numero: 'desc' } }))
  )
}

/** 07 §1 /rodadas: rodadas do ciclo (o corrente por padrão), numa consulta com o contemplado. */
export async function listarRodadas(numero?: number) {
  const ciclo = await cicloCorrente(numero)
  if (!ciclo) return null
  const [rodadas, ciclos] = await Promise.all([
    db.rodada.findMany({
      where: { cicloId: ciclo.id },
      orderBy: [{ sequencia: 'asc' }, { criadaEm: 'asc' }],
      select: {
        id: true,
        sequencia: true,
        mesReferencia: true,
        agendadaPara: true,
        status: true,
        atrasada: true,
        contemplado: { select: { apelido: true } },
      },
    }),
    db.ciclo.findMany({ orderBy: { numero: 'asc' }, select: { numero: true, status: true } }),
  ])
  return { ciclo: { ...ciclo, dataInicio: deDb(ciclo.dataInicio) }, rodadas, ciclos }
}

/** Próximo sorteio agendado (painel, 07 §3.3). */
export const proximoSorteio = () =>
  db.rodada.findFirst({
    where: { status: 'AGENDADA', ciclo: { status: { in: ['PLANEJADO', 'EM_ANDAMENTO'] } } },
    orderBy: { agendadaPara: 'asc' },
    select: {
      id: true,
      agendadaPara: true,
      mesReferencia: true,
      sequencia: true,
      ciclo: { select: { numero: true } },
    },
  })

export type LinhaPrevia = Pick<
  LinhaSnapshot,
  'pessoaId' | 'nome' | 'elegivel' | 'motivos' | 'declarouNaoConcorrer'
>

/**
 * 07 §3.4, aba Sorteio. Antes do corte, a prévia da elegibilidade calculada agora (sem sortear);
 * depois, o snapshot gravado. Número fixo de consultas (13 DP-02).
 */
export async function detalheRodada(rodadaId: string, pessoaId: string, agora: Date) {
  const rodada = await db.rodada.findUnique({
    where: { id: rodadaId },
    include: {
      ciclo: { select: { id: true, numero: true, status: true } },
      sorteio: true,
      contemplado: { select: { apelido: true } },
    },
  })
  if (!rodada) return null
  const [minhasDeclaracoes, obrigacao] = await Promise.all([
    db.declaracao.findMany({
      where: { rodadaId, pessoaId, revogadaEm: null },
      select: { tipo: true, texto: true, registradaEm: true },
    }),
    db.obrigacao.findFirst({
      where: { rodadaId, tipo: 'CONTRIBUICAO', autoquitada: false },
      select: { vencimentoEm: true, valorCentavos: true },
    }),
  ])

  let linhas: LinhaPrevia[] = []
  let concorreram: string[] = []
  if (rodada.sorteio) {
    const snap = rodada.sorteio.snapshot as { participantes: LinhaSnapshot[] }
    linhas = snap.participantes
    const nomes = await apelidosDe(rodada.sorteio.elegiveisIds)
    concorreram = rodada.sorteio.elegiveisIds.map((id) => nomes.get(id) ?? id)
  } else if (rodada.status === 'AGENDADA' && rodada.ciclo.status === 'EM_ANDAMENTO') {
    const entrada = await emTransacao((tx) => carregarEntrada(tx, rodada.cicloId, rodada.id, agora))
    const naoConcorrem = await db.declaracao.findMany({
      where: { tipo: 'NAO_CONCORRER', rodadaId, revogadaEm: null },
      select: { pessoaId: true },
    })
    const previa = apurarSorteio(
      { ...entrada, naoConcorrem: naoConcorrem.map((d) => d.pessoaId) },
      agora,
      () => 0,
    )
    linhas = (previa.snapshot as { participantes: LinhaSnapshot[] }).participantes
  } else if (rodada.status === 'AGENDADA') {
    // ciclo PLANEJADO: os previstos ainda não são participantes (RN-CIC-03)
    const previstos = await db.membro.findMany({
      where: {
        status: { in: ['ATIVO', 'IMPOSSIBILITADO'] },
        ...(rodada.ciclo.numero === 1 ? { origem: 'FUNDADOR' as const } : {}),
      },
      select: { pessoaId: true, pessoa: { select: { apelido: true } } },
    })
    const naoConcorrem = new Set(
      (
        await db.declaracao.findMany({
          where: { tipo: 'NAO_CONCORRER', rodadaId, revogadaEm: null },
          select: { pessoaId: true },
        })
      ).map((d) => d.pessoaId),
    )
    linhas = previstos.map((m) => ({
      pessoaId: m.pessoaId,
      nome: m.pessoa.apelido,
      elegivel: !naoConcorrem.has(m.pessoaId),
      motivos: naoConcorrem.has(m.pessoaId) ? ['OPTOU_NAO_CONCORRER'] : [],
      declarouNaoConcorrer: naoConcorrem.has(m.pessoaId),
    }))
  }
  const apelidos = await apelidosDe(linhas.map((l) => l.pessoaId))
  return {
    rodada: {
      id: rodada.id,
      sequencia: rodada.sequencia,
      mesReferencia: rodada.mesReferencia,
      status: rodada.status,
      agendadaPara: rodada.agendadaPara,
      atrasada: rodada.atrasada,
      prazoCompraAte: rodada.prazoCompraAte,
      tipoContemplacao: rodada.tipoContemplacao,
      motivoSemContemplado: rodada.motivoSemContemplado,
      contribuicaoCentavos: rodada.contribuicaoCentavos,
      contemplado: rodada.contemplado?.apelido ?? null,
    },
    ciclo: rodada.ciclo,
    sorteio: rodada.sorteio && {
      corteEm: rodada.sorteio.corteEm,
      indice: rodada.sorteio.indice,
      hash: rodada.sorteio.snapshotSha256,
      disparadoPor: rodada.sorteio.disparadoPorId
        ? ((await apelidosDe([rodada.sorteio.disparadoPorId])).get(rodada.sorteio.disparadoPorId) ??
          '—')
        : 'sistema (automático)',
    },
    participantes: linhas.map((l) => ({
      ...l,
      apelido: apelidos.get(l.pessoaId) ?? l.nome,
      eu: l.pessoaId === pessoaId,
    })),
    concorreram,
    vencimentoEm: obrigacao?.vencimentoEm ?? null,
    euDeclarei: {
      naoConcorrer: minhasDeclaracoes.some((d) => d.tipo === 'NAO_CONCORRER'),
      justificativa:
        minhasDeclaracoes.find((d) => d.tipo === 'JUSTIFICATIVA_PRORROGACAO')?.texto ?? null,
    },
    podeSortear: rodada.status === 'AGENDADA' && agora >= rodada.agendadaPara,
  }
}
