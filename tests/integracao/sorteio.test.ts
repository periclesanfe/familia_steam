import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hashSnapshot } from '@/domain/hash'
import { instanteLocal } from '@/domain/tempo'
import {
  declararNaoConcorrer,
  executarRodada,
  justificarAntecipadamente,
} from '@/features/rodadas/servico'
import { executarTick } from '@/server/tick'

import { dono, limpar } from './banco'
import { ctxDe, pagarTudo, prepararCiclo1 } from './fabricas'

const primeiro = () => 0
const relogio = (t: Date) => {
  vi.setSystemTime(t)
}
const rodadaDe = (sequencia: number) =>
  dono.rodada.findFirstOrThrow({
    where: { sequencia, status: { not: 'CANCELADA' } },
    orderBy: { criadaEm: 'desc' },
  })

describe('execução da rodada (RN-SOR-02..11, RN-CIC-02..04)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-22: "Realizar sorteio" às 11:59 do dia 3 é recusado', async () => {
    const [ana = ''] = await prepararCiclo1()
    const r1 = await rodadaDe(1)
    relogio(instanteLocal('2026-10-03', '11:59'))
    await expect(executarRodada(r1.id, ana)).rejects.toMatchObject({
      codigo: 'SORTEIO_ANTES_DO_HORARIO',
    })
    expect(await dono.sorteio.count()).toBe(0)
  })

  it('1º corte: ciclo em andamento, sorteio com hash, contribuições, prazos e rodada 2', async () => {
    const ids = await prepararCiclo1()
    const r1 = await rodadaDe(1)
    relogio(instanteLocal('2026-10-03', '12:00'))
    expect(await executarRodada(r1.id, null, primeiro)).toMatchObject({
      executada: true,
      status: 'CONTEMPLADA',
    })

    const ciclo = await dono.ciclo.findFirstOrThrow({ include: { participacoes: true } })
    expect(ciclo.status).toBe('EM_ANDAMENTO')
    expect(ciclo.participacoes).toHaveLength(5)
    const s = await dono.sorteio.findFirstOrThrow()
    expect(s.snapshotSha256).toBe(hashSnapshot(s.snapshot as never))
    expect(s.elegiveisIds).toHaveLength(5)
    const contemplado = [...ids].sort()[0]
    expect(s.contempladoId).toBe(contemplado)

    const rodada = await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })
    expect(rodada).toMatchObject({
      status: 'CONTEMPLADA',
      tipoContemplacao: 'SORTEIO',
      atrasada: false,
      pagantesNoCorte: 5,
    })
    expect(rodada.prazoCompraAte?.toISOString()).toBe('2026-11-03T03:00:00.000Z') // fim de 02/11
    const obrigacoes = await dono.obrigacao.findMany({ where: { rodadaId: r1.id } })
    expect(obrigacoes).toHaveLength(5)
    expect(obrigacoes.filter((o) => o.autoquitada).map((o) => o.devedorId)).toEqual([contemplado])
    expect(new Set(obrigacoes.map((o) => o.vencimentoEm.toISOString()))).toEqual(
      new Set(['2026-10-04T03:00:00.000Z']),
    )
    expect(new Set(obrigacoes.map((o) => o.credorId))).toEqual(new Set([contemplado]))

    const r2 = await rodadaDe(2)
    expect(r2).toMatchObject({ status: 'AGENDADA', mesReferencia: '2026-11' })
    expect(r2.agendadaPara.toISOString()).toBe('2026-11-03T15:00:00.000Z')
  })

  it('CA-20: dois disparos simultâneos → um Sorteio; o outro vê o resultado existente', async () => {
    const [ana = '', bruno = ''] = await prepararCiclo1()
    const r1 = await rodadaDe(1)
    relogio(instanteLocal('2026-10-03', '12:05'))
    const resultados = await Promise.all([
      executarRodada(r1.id, ana, primeiro),
      executarRodada(r1.id, bruno, primeiro),
    ])
    expect(resultados.map((r) => r.executada).sort()).toEqual([false, true])
    expect(await dono.sorteio.count()).toBe(1)
  })

  it('CA-06: A declara antes do corte (fica fora); B declara depois (recusado)', async () => {
    const [ana = '', bruno = ''] = await prepararCiclo1()
    const r1 = await rodadaDe(1)
    relogio(instanteLocal('2026-10-02', '20:00'))
    await declararNaoConcorrer(ctxDe(ana, new Date()), { rodadaId: r1.id })
    relogio(instanteLocal('2026-10-03', '12:00'))
    await executarRodada(r1.id, null, primeiro)
    await expect(
      declararNaoConcorrer(ctxDe(bruno, new Date()), { rodadaId: r1.id }),
    ).rejects.toMatchObject({ codigo: 'RODADA_ENCERRADA' })
    const s = await dono.sorteio.findFirstOrThrow()
    expect(s.elegiveisIds).not.toContain(ana)
    expect(s.elegiveisIds).toHaveLength(4)
  })

  it('CA-11: todos os não contemplados optam por não concorrer → SEM_CONTEMPLADO, 0 obrigações', async () => {
    const ids = await prepararCiclo1()
    const r1 = await rodadaDe(1)
    relogio(instanteLocal('2026-10-01', '10:00'))
    for (const id of ids) {
      await declararNaoConcorrer(ctxDe(id, new Date()), { rodadaId: r1.id })
    }
    relogio(instanteLocal('2026-10-03', '12:00'))
    expect(await executarRodada(r1.id, null)).toMatchObject({ status: 'SEM_CONTEMPLADO' })
    expect(await dono.obrigacao.count()).toBe(0)
    expect(
      (await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).motivoSemContemplado,
    ).toBe('NENHUM_ELEGIVEL')
    expect(await rodadaDe(2)).toMatchObject({ status: 'AGENDADA', mesReferencia: '2026-11' })
  })

  it('justificativa antecipada é copiada para a contribuição (RN-FIN-03)', async () => {
    const [ana = '', bruno = ''] = await prepararCiclo1()
    const r1 = await rodadaDe(1)
    relogio(instanteLocal('2026-10-02', '09:00'))
    await justificarAntecipadamente(ctxDe(bruno, new Date()), {
      rodadaId: r1.id,
      texto: 'salário cai dia 5',
    })
    relogio(instanteLocal('2026-10-03', '12:00'))
    await executarRodada(r1.id, null, primeiro) // contemplado = menor id
    const o = await dono.obrigacao.findFirstOrThrow({ where: { devedorId: bruno } })
    if (o.autoquitada) return // bruno foi o contemplado: nada a copiar
    expect(o.justificativa).toBe('salário cai dia 5')
    expect(o.justificadaEm).toEqual(instanteLocal('2026-10-02', '09:00'))
    expect(ana).toBeTruthy()
  })

  it('CA-21: sorteio atrasado (04/11 09:00) → prazos contam de 04/11; próxima rodada em 03/12', async () => {
    await prepararCiclo1()
    relogio(instanteLocal('2026-10-03', '12:00'))
    await executarRodada((await rodadaDe(1)).id, null, primeiro)
    await pagarTudo(instanteLocal('2026-10-03', '18:00'))
    const r2 = await rodadaDe(2)
    relogio(instanteLocal('2026-11-04', '09:00'))
    await executarRodada(r2.id, null, primeiro)
    const depois = await dono.rodada.findUniqueOrThrow({ where: { id: r2.id } })
    expect(depois.atrasada).toBe(true)
    expect(depois.dataSorteio?.toISOString().slice(0, 10)).toBe('2026-11-04')
    expect(depois.prazoCompraAte?.toISOString()).toBe(instanteLocal('2026-12-05').toISOString()) // fim de 04/12
    const o = await dono.obrigacao.findFirstOrThrow({ where: { rodadaId: r2.id } })
    expect(o.vencimentoEm).toEqual(instanteLocal('2026-11-05')) // fim de 04/11
    expect((await rodadaDe(3)).agendadaPara.toISOString()).toBe('2026-12-03T15:00:00.000Z')
  })

  it('ciclo completo: 5 contemplados → EM_REVISAO e ciclo 2 planejado em 03/03/2027', async () => {
    await prepararCiclo1()
    const meses = ['2026-10-03', '2026-11-03', '2026-12-03', '2027-01-03', '2027-02-03']
    for (const [i, dia] of meses.entries()) {
      relogio(instanteLocal(dia, '12:00'))

      const r = await rodadaDe(i + 1)

      expect(await executarRodada(r.id, null, primeiro)).toMatchObject({ status: 'CONTEMPLADA' })

      await pagarTudo(instanteLocal(dia, '18:00'))
    }
    const c1 = await dono.ciclo.findUniqueOrThrow({ where: { numero: 1 } })
    expect(c1.status).toBe('EM_REVISAO')
    const contemplados = await dono.rodada.findMany({
      where: { cicloId: c1.id },
      select: { contempladoId: true },
    })
    expect(new Set(contemplados.map((r) => r.contempladoId)).size).toBe(5)
    const c2 = await dono.ciclo.findUniqueOrThrow({
      where: { numero: 2 },
      include: { rodadas: true },
    })
    expect([c2.status, c2.dataInicio.toISOString().slice(0, 10)]).toEqual([
      'PLANEJADO',
      '2027-03-03',
    ])
    expect(c2.rodadas.map((r) => [r.sequencia, r.status])).toEqual([[1, 'AGENDADA']])
  })

  it('ciclo 2 sem confirmações suficientes é cancelado e o ciclo 1 encerra sem seguinte (RN-CIC-07)', async () => {
    const ids = await prepararCiclo1()
    const meses = ['2026-10-03', '2026-11-03', '2026-12-03', '2027-01-03', '2027-02-03']
    for (const [i, dia] of meses.entries()) {
      relogio(instanteLocal(dia, '12:00'))

      await executarRodada((await rodadaDe(i + 1)).id, null, primeiro)

      await pagarTudo(instanteLocal(dia, '18:00'))
    }
    const c2 = await dono.ciclo.findUniqueOrThrow({
      where: { numero: 2 },
      include: { rodadas: true },
    })
    await dono.declaracao.create({
      data: {
        tipo: 'CONFIRMA_PROXIMO_CICLO',
        pessoaId: ids[0] ?? '',
        cicloId: c2.id,
        efetivaEm: instanteLocal('2027-02-20'),
        registradaEm: instanteLocal('2027-02-20'),
        registradaPorId: ids[0] ?? '',
      },
    })
    relogio(instanteLocal('2027-03-03', '12:00'))
    expect(await executarRodada(c2.rodadas[0]?.id ?? '', null)).toMatchObject({
      status: 'CANCELADA',
    })
    expect((await dono.ciclo.findUniqueOrThrow({ where: { numero: 2 } })).status).toBe('CANCELADO')
    expect(await dono.ciclo.findUniqueOrThrow({ where: { numero: 1 } })).toMatchObject({
      status: 'ENCERRADO',
      semCicloSeguinte: true,
    })
    // RN-CIC-06: quem não confirmou foi encerrado sem saiuEm
    expect(await dono.membro.count({ where: { motivoEncerramento: 'NAO_CONFIRMOU_ART44' } })).toBe(
      4,
    )
  })

  it('CA-150: dois ticks simultâneos → só um pega o lease', async () => {
    await prepararCiclo1()
    relogio(instanteLocal('2026-10-03', '12:10'))
    const [a, b] = await Promise.all([executarTick(), executarTick()])
    const resumos = [a, b]
    expect(resumos.filter((r) => !r.executou)).toHaveLength(1)
    expect(await dono.sorteio.count()).toBe(1)
    // depois de liberado, um novo tick roda sem duplicar nada (idempotente, CA-105)
    const c = await executarTick()
    expect(c).toMatchObject({ executou: true, sorteios: [] })
    expect(await dono.sorteio.count()).toBe(1)
  })
})
