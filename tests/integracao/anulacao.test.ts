import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instanteLocal } from '@/domain/tempo'
import { registrarPagamento } from '@/features/financeiro/servico'
import { declararNaoConcorrer, executarRodada } from '@/features/rodadas/servico'
import { convocar, votar } from '@/features/votacoes/servico'

import { dono, limpar } from './banco'
import { ctxDe, pagarTudo, prepararCiclo1 } from './fabricas'

const agora = () => new Date()
const hora = (dia: string, h = '12:00') => {
  vi.setSystemTime(instanteLocal(dia, h))
}

async function anular(ids: string[], rodadaId: string) {
  const [a = '', b = '', c = ''] = ids
  const { votacaoId } = await convocar(ctxDe(a, agora()), {
    assunto: 'CASO_OMISSO',
    proposicao: 'Anular a rodada',
    justificativa: 'O sorteio foi feito com a lista errada',
    efeito: { tipo: 'ANULAR_RODADA', rodadaId },
  })
  for (const x of [a, b, c]) await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
  return dono.votacao.findUniqueOrThrow({ where: { id: votacaoId } })
}

/** Pagamento registrado pelo recebedor (forma diversa confirmada, conta). */
async function pagar(recebedor: string, obrigacaoId: string, valor: number, pixEm: Date) {
  const { pagamentoId } = await registrarPagamento(ctxDe(recebedor, agora()), {
    obrigacaoId,
    valor,
    pixEm,
    formaDiversa: 'on',
  })
  return pagamentoId
}

/**
 * CA-97: r1 (A) fechada com SOBRA 3510; E não concorre em r2; r2 sorteia B; D paga 1000,
 * C paga 2500 com atraso; a SOBRA A→B não é paga. ATA de anulação em 10/11.
 */
async function anulada() {
  const ids = await prepararCiclo1()
  hora('2026-10-03')
  const r1 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
  await executarRodada(r1.id, null, () => 0)
  await pagarTudo(instanteLocal('2026-10-03', '18:00'))
  await dono.rodada.update({
    where: { id: r1.id },
    data: { status: 'FECHADA', sobraCentavos: 3510 },
  })
  const A = (await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).contempladoId ?? ''
  const outros = ids.filter((x) => x !== A)
  const E = outros[3] ?? ''
  const r2 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 2 } })
  hora('2026-11-01')
  await declararNaoConcorrer(ctxDe(E, agora()), { rodadaId: r2.id })
  hora('2026-11-03')
  await executarRodada(r2.id, null, () => 0)
  const B = (await dono.rodada.findUniqueOrThrow({ where: { id: r2.id } })).contempladoId ?? ''
  const [C = '', D = ''] = outros.filter((x) => x !== B && x !== E)
  const deve = (devedorId: string) =>
    dono.obrigacao.findFirstOrThrow({ where: { rodadaId: r2.id, devedorId, tipo: 'CONTRIBUICAO' } })
  hora('2026-11-05')
  await pagar(B, (await deve(D)).id, 1000, agora())
  await pagar(B, (await deve(C)).id, 2500, agora()) // venceu em 03/11: em atraso
  const sobra = await dono.obrigacao.findFirstOrThrow({
    where: { tipo: 'SOBRA', rodadaOrigemId: r1.id },
  })
  expect(sobra).toMatchObject({ devedorId: A, credorId: B, valorCentavos: 3510, rodadaId: r2.id })
  const contribE = await deve(E)
  hora('2026-11-10')
  const votacao = await anular(ids, r2.id)
  const substituta = await dono.rodada.findFirstOrThrow({
    where: { sequencia: 2, status: 'AGENDADA' },
  })
  return { ids, r1, r2, A, B, C, D, E, votacao, substituta, contribE }
}

describe('anulação de rodada (RN-SOR-13)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-97 e CA-141: anulada, substituta no dia seguinte, obrigações canceladas, devoluções, SOBRA renasce', async () => {
    const { r1, r2, A, B, C, D, E, votacao, substituta } = await anulada()
    expect(votacao.efeitoAplicadoEm).not.toBeNull()
    expect((await dono.rodada.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe('ANULADA')
    expect(substituta).toMatchObject({
      rodadaAnuladaId: r2.id,
      mesReferencia: r2.mesReferencia,
      agendadaPara: instanteLocal('2026-11-11', '12:00'),
    })
    expect(
      await dono.obrigacao.count({
        where: { rodadaId: r2.id, tipo: { not: 'DEVOLUCAO' }, canceladaEm: null },
      }),
    ).toBe(0)
    const devolucoes = await dono.obrigacao.findMany({ where: { tipo: 'DEVOLUCAO' } })
    expect(devolucoes.map((o) => [o.devedorId, o.credorId, o.valorCentavos]).sort()).toEqual(
      [
        [B, D, 1000],
        [B, C, 2500],
      ].sort(),
    )
    expect(
      await dono.declaracao.count({
        where: { rodadaId: substituta.id, pessoaId: E, tipo: 'NAO_CONCORRER' },
      }),
    ).toBe(1)

    // CA-141: sorteio da substituta em 11/11 às 12:00, sem atraso; dezembro não duplica
    hora('2026-11-11')
    await executarRodada(substituta.id, null, () => 0)
    const s = await dono.rodada.findUniqueOrThrow({ where: { id: substituta.id } })
    expect(s).toMatchObject({ status: 'CONTEMPLADA', atrasada: false })
    expect(await dono.rodada.count({ where: { sequencia: 3 } })).toBe(1)
    const sorteio = await dono.sorteio.findFirstOrThrow({ where: { rodadaId: substituta.id } })
    expect(sorteio.elegiveisIds.sort()).toEqual([B, C, D].sort()) // C sem postergação
    expect(
      await dono.obrigacao.findFirstOrThrow({
        where: { tipo: 'SOBRA', rodadaOrigemId: r1.id, canceladaEm: null },
      }),
    ).toMatchObject({ rodadaId: substituta.id, devedorId: A, credorId: s.contempladoId })
  })

  it('CA-156: Pix ao contemplado da anulada feito antes e registrado depois da ATA → DEVOLUCAO', async () => {
    const { B, E, contribE } = await anulada()
    hora('2026-11-10', '15:00')
    const p = await pagar(B, contribE.id, 2500, instanteLocal('2026-11-08', '09:00'))
    expect(
      await dono.obrigacao.findFirstOrThrow({ where: { pagamentoOrigemId: p } }),
    ).toMatchObject({ tipo: 'DEVOLUCAO', devedorId: B, credorId: E, valorCentavos: 2500 })
  })

  it('CA-151: substituta sai SEM_CONTEMPLADO com a seguinte já agendada → nenhuma rodada nova', async () => {
    const { B, C, D, substituta } = await anulada()
    for (const x of [B, C, D]) {
      await declararNaoConcorrer(ctxDe(x, agora()), { rodadaId: substituta.id })
    }
    hora('2026-11-11')
    await executarRodada(substituta.id, null, () => 0)
    expect((await dono.rodada.findUniqueOrThrow({ where: { id: substituta.id } })).status).toBe(
      'SEM_CONTEMPLADO',
    )
    expect(await dono.rodada.count({ where: { sequencia: 3 } })).toBe(1)
  })

  it('CA-152: com rodada posterior já sorteada → efeito não aplicável', async () => {
    const ids = await prepararCiclo1()
    for (const [i, dia] of ['2026-10-03', '2026-11-03'].entries()) {
      hora(dia)
      const r = await dono.rodada.findFirstOrThrow({
        where: { sequencia: i + 1, status: 'AGENDADA' },
      })
      await executarRodada(r.id, null, () => 0)
    }
    hora('2026-11-10')
    const r1 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
    const v = await anular(ids, r1.id)
    expect(v.efeitoNaoAplicavel).toContain('posterior')
    expect((await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).status).toBe(
      'CONTEMPLADA',
    )
  })
})
