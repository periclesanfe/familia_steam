import { describe, expect, it } from 'vitest'

import type { ContribuicaoFato } from './financeiro'
import { sha256hex, jsonCanonico, hashSnapshot } from './hash'
import { apurarSorteio, escolher, type EntradaSorteio, type ParticipanteSorteio } from './sorteio'
import { fimDoDia, instanteLocal } from './tempo'

const C1 = 'ciclo-1'
const C2 = 'ciclo-2'
const inicio = instanteLocal('2026-10-03', '12:00')
const corteNov = instanteLocal('2026-11-03', '12:00')
const corteDez = instanteLocal('2026-12-03', '12:00')
const nunca = () => {
  throw new Error('rng não devia ser chamado')
}
const primeiro = () => 0

const pessoa = (id: string, extra: Partial<ParticipanteSorteio> = {}): ParticipanteSorteio => ({
  pessoaId: id,
  nome: id.toUpperCase(),
  entrouEm: inicio,
  saiuEm: null,
  impossibilitado: false,
  ...extra,
})

let seq = 0
/** Contribuição vencendo no fim do dia `dia` (sorteio naquele dia), com pagamentos opcionais. */
function contrib(
  devedorId: string,
  dia: string,
  extra: Partial<ContribuicaoFato> & { pagoEm?: Date } = {},
): ContribuicaoFato {
  const { pagoEm, ...resto } = extra
  seq++
  return {
    id: `o${String(seq)}`,
    devedorId,
    cicloId: C1,
    valorCentavos: 2500,
    vencimentoEm: fimDoDia(dia),
    justificadaEm: null,
    canceladaEm: null,
    autoquitada: false,
    diasProrrogacao: 7,
    pagamentos: pagoEm
      ? [{ status: 'DECLARADO', formaDiversa: false, valorCentavos: 2500, pixEm: pagoEm }]
      : [],
    ...resto,
  }
}

const entrada = (e: Partial<EntradaSorteio>): EntradaSorteio => ({
  cicloId: C1,
  participantes: ['a', 'b', 'c', 'd', 'e'].map((id) => pessoa(id)),
  contempladosIds: [],
  contribuicoes: [],
  naoConcorrem: [],
  primeiroCorte: inicio,
  ...e,
})

describe('apurarSorteio (RN-SOR-05)', () => {
  it('CA-05: 5 em dia, ninguém contemplado → sorteio entre os 5', () => {
    const r = apurarSorteio(entrada({}), inicio, primeiro)
    expect(r.elegiveisIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(r.resultado).toEqual({
      tipo: 'CONTEMPLADA',
      tipoContemplacao: 'SORTEIO',
      contempladoId: 'a',
    })
    expect(r.indice).toBe(0)
  })

  it('CA-07: restam A e B, A optou por não concorrer → B único elegível, sem aleatoriedade', () => {
    const r = apurarSorteio(
      entrada({ contempladosIds: ['c', 'd', 'e'], naoConcorrem: ['a'] }),
      corteNov,
      nunca,
    )
    expect(r.resultado).toEqual({
      tipo: 'CONTEMPLADA',
      tipoContemplacao: 'UNICO_ELEGIVEL',
      contempladoId: 'b',
    })
    expect(r.indice).toBeNull()
  })

  it('CA-08: resta só A, com dívida vencida → obrigatória pelo art. 14; a dívida continua', () => {
    const r = apurarSorteio(
      entrada({
        contempladosIds: ['b', 'c', 'd', 'e'],
        contribuicoes: [contrib('a', '2026-11-03')],
      }),
      corteDez,
      nunca,
    )
    expect(r.resultado).toEqual({
      tipo: 'CONTEMPLADA',
      tipoContemplacao: 'OBRIGATORIA_ART14',
      contempladoId: 'a',
    })
  })

  it('CA-09: resta só A, IMPOSSIBILITADO → SEM_CONTEMPLADO(ULTIMO_IMPOSSIBILITADO)', () => {
    const r = apurarSorteio(
      entrada({
        participantes: [pessoa('a', { impossibilitado: true }), pessoa('b')],
        contempladosIds: ['b'],
      }),
      corteNov,
      nunca,
    )
    expect(r.resultado).toEqual({ tipo: 'SEM_CONTEMPLADO', motivo: 'ULTIMO_IMPOSSIBILITADO' })
  })

  it('CA-10: A optou por não concorrer, C saiu e A ficou único → art. 14 ignora a declaração', () => {
    const r = apurarSorteio(
      entrada({
        participantes: [pessoa('a'), pessoa('b'), pessoa('c', { saiuEm: corteDez })],
        contempladosIds: ['b'],
        naoConcorrem: ['a'],
      }),
      new Date(corteDez.getTime() + 1),
      nunca,
    )
    expect(r.resultado).toMatchObject({ tipoContemplacao: 'OBRIGATORIA_ART14', contempladoId: 'a' })
  })

  it('CA-12: P1 e P2 postergados; os normais C e D optaram → SEM_CONTEMPLADO (normais bloqueiam)', () => {
    const r = apurarSorteio(
      entrada({
        participantes: ['p1', 'p2', 'c', 'd', 'x'].map((id) => pessoa(id)),
        contempladosIds: ['x'],
        contribuicoes: [
          contrib('p1', '2026-10-03', { pagoEm: instanteLocal('2026-10-05') }),
          contrib('p2', '2026-10-03', { pagoEm: instanteLocal('2026-10-05') }),
        ],
        naoConcorrem: ['c', 'd'],
      }),
      corteNov,
      nunca,
    )
    expect(r.resultado).toEqual({ tipo: 'SEM_CONTEMPLADO', motivo: 'NENHUM_ELEGIVEL' })
    const snap = r.snapshot as { participantes: { pessoaId: string; motivos: string[] }[] }
    expect(snap.participantes.find((p) => p.pessoaId === 'p1')?.motivos).toEqual([
      'POSTERGADO_AGUARDANDO_DEMAIS',
    ])
  })

  it('CA-13: os 4 não contemplados atrasaram no mês 1; no mês 2 concorrem os 2 em dia', () => {
    const atrasou = (id: string, pagou: boolean) =>
      contrib(id, '2026-10-03', pagou ? { pagoEm: instanteLocal('2026-10-20') } : {})
    const r = apurarSorteio(
      entrada({
        contempladosIds: ['e'],
        contribuicoes: [
          atrasou('a', true),
          atrasou('b', true),
          atrasou('c', false),
          atrasou('d', false),
        ],
      }),
      corteNov,
      primeiro,
    )
    expect(r.elegiveisIds).toEqual(['a', 'b'])
    const snap = r.snapshot as { participantes: { pessoaId: string; camada: string | null }[] }
    expect(snap.participantes.find((p) => p.pessoaId === 'a')?.camada).toBe('POSTERGADO')
  })

  it('CA-14: A pagou dia 5 (atrasado) → postergado; em novembro fica fora mesmo em dia', () => {
    const o = contrib('a', '2026-10-03', { pagoEm: instanteLocal('2026-10-05') })
    const r = apurarSorteio(
      entrada({ contempladosIds: ['e'], contribuicoes: [o] }),
      corteNov,
      primeiro,
    )
    expect(r.elegiveisIds).toEqual(['b', 'c', 'd'])
    const snap = r.snapshot as {
      participantes: { pessoaId: string; emDia: boolean; postergado: boolean }[]
    }
    expect(snap.participantes.find((p) => p.pessoaId === 'a')).toMatchObject({
      emDia: true,
      postergado: true,
    })
  })

  it('CA-15: pagou 23:58 do dia 3 (registrou no dia 5) → sem atraso e sem postergação', () => {
    const o = contrib('a', '2026-10-03', { pagoEm: instanteLocal('2026-10-03', '23:58') })
    const r = apurarSorteio(
      entrada({ contempladosIds: ['e'], contribuicoes: [o] }),
      corteNov,
      primeiro,
    )
    expect(r.elegiveisIds).toContain('a')
  })

  it('CA-16: justificada 23:50 do dia 3 e paga no dia 9 → prorrogada e no prazo', () => {
    const o = contrib('a', '2026-10-03', {
      justificadaEm: instanteLocal('2026-10-03', '23:50'),
      pagoEm: instanteLocal('2026-10-09', '10:00'),
    })
    const r = apurarSorteio(
      entrada({ contempladosIds: ['e'], contribuicoes: [o] }),
      corteNov,
      primeiro,
    )
    expect(r.elegiveisIds).toContain('a')
  })

  it('CA-17: contribuição do ciclo 1 aberta no 1º corte do ciclo 2 → não em dia e postergado', () => {
    const velha = contrib('a', '2027-02-03')
    const corte = instanteLocal('2027-03-03', '12:00')
    const r = apurarSorteio(
      entrada({ cicloId: C2, contribuicoes: [velha], primeiroCorte: corte }),
      corte,
      primeiro,
    )
    const snap = r.snapshot as {
      participantes: { pessoaId: string; emDia: boolean; postergado: boolean }[]
    }
    expect(snap.participantes.find((p) => p.pessoaId === 'a')).toMatchObject({
      emDia: false,
      postergado: true,
    })
    expect(r.elegiveisIds).not.toContain('a')
  })

  it('CA-18: atrasou só no último mês do ciclo 1 e quitou antes do ciclo 2 → não postergado', () => {
    const o = contrib('a', '2027-02-03', { pagoEm: instanteLocal('2027-02-20') })
    const corte = instanteLocal('2027-03-03', '12:00')
    const r = apurarSorteio(
      entrada({ cicloId: C2, contribuicoes: [o], primeiroCorte: corte }),
      corte,
      primeiro,
    )
    expect(r.elegiveisIds).toContain('a')
  })

  it('CA-116: NC = {P postergado e em dia, I impossibilitado} → P único elegível', () => {
    const r = apurarSorteio(
      entrada({
        participantes: [pessoa('p'), pessoa('i', { impossibilitado: true }), pessoa('x')],
        contempladosIds: ['x'],
        contribuicoes: [contrib('p', '2026-10-03', { pagoEm: instanteLocal('2026-10-06') })],
      }),
      corteNov,
      nunca,
    )
    expect(r.resultado).toEqual({
      tipo: 'CONTEMPLADA',
      tipoContemplacao: 'UNICO_ELEGIVEL',
      contempladoId: 'p',
    })
  })

  it('pagamento INVALIDADO não conta; forma diversa só confirmada (RN-FIN-06)', () => {
    const o = contrib('a', '2026-10-03', {
      pagamentos: [
        {
          status: 'INVALIDADO',
          formaDiversa: false,
          valorCentavos: 2500,
          pixEm: instanteLocal('2026-10-03'),
        },
        {
          status: 'DECLARADO',
          formaDiversa: true,
          valorCentavos: 2500,
          pixEm: instanteLocal('2026-10-03'),
        },
      ],
    })
    const r = apurarSorteio(
      entrada({ contempladosIds: ['e'], contribuicoes: [o] }),
      corteNov,
      primeiro,
    )
    expect(r.elegiveisIds).not.toContain('a')
  })

  it('CA-23: sha256 do JSON canônico do snapshot; motivo por pessoa', () => {
    const r = apurarSorteio(
      entrada({ contempladosIds: ['e'], naoConcorrem: ['b'] }),
      corteNov,
      primeiro,
    )
    expect(hashSnapshot(r.snapshot)).toBe(sha256hex(jsonCanonico(r.snapshot)))
    const snap = r.snapshot as { participantes: { pessoaId: string; motivos: string[] }[] }
    expect(snap.participantes.find((p) => p.pessoaId === 'e')?.motivos).toEqual(['JA_CONTEMPLADO'])
    expect(snap.participantes.find((p) => p.pessoaId === 'b')?.motivos).toEqual([
      'OPTOU_NAO_CONCORRER',
    ])
  })

  it('CA-24: RNG devolve 2 com 4 elegíveis ordenados → elegiveis[2]', () => {
    expect(escolher(['d', 'b', 'a', 'c'], () => 2)).toEqual({ indice: 2, escolhido: 'c' })
    expect(() => escolher(['a'], () => 1)).toThrow(RangeError)
  })

  it('NC vazio é erro de consistência', () => {
    expect(() =>
      apurarSorteio(entrada({ contempladosIds: ['a', 'b', 'c', 'd', 'e'] }), corteNov, primeiro),
    ).toThrow(/NC vazio/)
  })
})
