import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instanteLocal } from '@/domain/tempo'
import { recalcularAgendamentos } from '@/features/rodadas/ciclo'
import { responderProximoCiclo } from '@/features/rodadas/janela'
import { declararNaoConcorrer, executarRodada } from '@/features/rodadas/servico'
import { convocar, votar } from '@/features/votacoes/servico'

import { dono, limpar } from './banco'
import { ctxDe, pagarTudo, prepararCiclo1 } from './fabricas'

const agora = () => new Date()
const hora = (dia: string, h = '12:00') => {
  vi.setSystemTime(instanteLocal(dia, h))
}
const DIAS = ['2026-10-03', '2026-11-03', '2026-12-03', '2027-01-03', '2027-02-03']

/** Ciclo 1 inteiro: 5 sorteios pagos; conclui em 03/02/2027 e o ciclo 2 começa em 03/03. */
async function cicloConcluido() {
  const ids = await prepararCiclo1()
  for (const [i, dia] of DIAS.entries()) {
    hora(dia)
    const r = await dono.rodada.findFirstOrThrow({
      where: { sequencia: i + 1, status: 'AGENDADA' },
    })
    await executarRodada(r.id, null, () => 0)
    await pagarTudo(instanteLocal(dia, '18:00'))
  }
  const c2 = await dono.ciclo.findUniqueOrThrow({
    where: { numero: 2 },
    include: { rodadas: true },
  })
  const r1 = c2.rodadas[0]
  if (!r1) throw new Error('ciclo 2 sem rodada 1')
  return { ids, c2, r1 }
}

const responder = (pessoaId: string, cicloId: string, confirma = true) =>
  responderProximoCiclo(ctxDe(pessoaId, agora()), { cicloId, confirma })

describe('janela de revisão (RN-CIC-03/05/06)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-91: 4 confirmam e 1 silencia → ciclo 2 com 4, quórum 3; o silencioso encerra e segue integrante', async () => {
    const { ids, c2, r1 } = await cicloConcluido()
    expect((await dono.ciclo.findUniqueOrThrow({ where: { numero: 1 } })).status).toBe('EM_REVISAO')
    expect(c2.dataInicio.toISOString().slice(0, 10)).toBe('2027-03-03')
    const [silencioso = '', ...confirmam] = ids
    hora('2027-02-10')
    await responder(confirmam[0] ?? '', c2.id, false) // muda de ideia depois
    for (const x of confirmam) await responder(x, c2.id)
    hora('2027-03-03', '00:00')
    await expect(responder(silencioso, c2.id)).rejects.toMatchObject({
      codigo: 'ENTRADA_INVALIDA',
    })

    hora('2027-03-03')
    await executarRodada(r1.id, null, () => 0)
    expect(await dono.participacaoCiclo.count({ where: { cicloId: c2.id } })).toBe(4)
    expect(await dono.membro.findFirstOrThrow({ where: { pessoaId: silencioso } })).toMatchObject({
      status: 'ENCERRADO',
      motivoEncerramento: 'NAO_CONFIRMOU_ART44',
    })
    expect(
      (await dono.integranteFamilia.findFirstOrThrow({ where: { pessoaId: silencioso } })).status,
    ).toBe('ATIVO')
    expect((await dono.ciclo.findUniqueOrThrow({ where: { numero: 1 } })).status).toBe('ENCERRADO')
    const { votacaoId } = await convocar(ctxDe(confirmam[0] ?? '', agora()), {
      assunto: 'OUTRO',
      proposicao: 'Teste do quórum do ciclo 2',
      justificativa: 'CA-91',
      efeito: { tipo: 'NENHUM' },
    })
    expect(await dono.votacao.findUniqueOrThrow({ where: { id: votacaoId } })).toMatchObject({
      n: 4,
      quorum: 3,
    })
  })

  it('CA-144: não concorrer na rodada 1 do ciclo 2 só por quem confirmou; confirmação revogada → ignorada no corte', async () => {
    const { ids, c2, r1 } = await cicloConcluido()
    const [a = '', b = '', c = '', d = '', naoConfirmou = ''] = ids
    hora('2027-02-10')
    for (const x of [a, b, c, d]) await responder(x, c2.id)
    await expect(
      declararNaoConcorrer(ctxDe(naoConfirmou, agora()), { rodadaId: r1.id }),
    ).rejects.toMatchObject({ codigo: 'NAO_PARTICIPA' })
    await declararNaoConcorrer(ctxDe(a, agora()), { rodadaId: r1.id })
    await declararNaoConcorrer(ctxDe(b, agora()), { rodadaId: r1.id })
    await responder(b, c2.id, false) // B desiste do ciclo depois de declarar

    hora('2027-03-03')
    await executarRodada(r1.id, null, () => 0)
    const participantes = await dono.participacaoCiclo.findMany({ where: { cicloId: c2.id } })
    expect(participantes.map((p) => p.pessoaId).sort()).toEqual([a, c, d].sort())
    const s = await dono.sorteio.findFirstOrThrow({ where: { rodadaId: r1.id } })
    expect(s.elegiveisIds.sort()).toEqual([c, d].sort())
  })

  it('CA-92: só um confirma → ciclo 2 cancelado; SOBRA de 703 rateada 141/141/141/140/140 na ordem de contemplação', async () => {
    const { c2, r1 } = await cicloConcluido()
    const rodadas = await dono.rodada.findMany({
      where: { ciclo: { numero: 1 } },
      orderBy: { sequencia: 'asc' },
    })
    const ordem = rodadas.map((r) => r.contempladoId ?? '')
    const detentor = ordem[4] ?? ''
    await dono.rodada.updateMany({
      where: { id: { in: rodadas.map((r) => r.id) } },
      data: { status: 'FECHADA', sobraCentavos: 0 },
    })
    await dono.rodada.update({ where: { id: rodadas[4]?.id }, data: { sobraCentavos: 703 } })
    hora('2027-02-10')
    await responder(ordem[0] ?? '', c2.id)

    hora('2027-03-03')
    await executarRodada(r1.id, null, () => 0)
    expect((await dono.ciclo.findUniqueOrThrow({ where: { id: c2.id } })).status).toBe('CANCELADO')
    expect((await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).status).toBe('CANCELADA')
    expect(await dono.ciclo.findUniqueOrThrow({ where: { numero: 1 } })).toMatchObject({
      status: 'ENCERRADO',
      semCicloSeguinte: true,
    })
    const cotas = await dono.obrigacao.findMany({ where: { tipo: 'RATEIO_SOBRA' } })
    expect(ordem.map((p) => cotas.find((o) => o.credorId === p)?.valorCentavos)).toEqual([
      141, 141, 141, 140, 140,
    ])
    expect(cotas.every((o) => o.devedorId === detentor)).toBe(true)
    expect(cotas.find((o) => o.credorId === detentor)?.autoquitada).toBe(true)
    expect(await dono.membro.count({ where: { motivoEncerramento: 'NAO_CONFIRMOU_ART44' } })).toBe(
      4,
    )
  })

  it('CA-143: ENCERRAR_AO_FIM_DO_CICLO no mês 2 → na conclusão ENCERRADO sem ciclo seguinte; prêmio convertido é rateado', async () => {
    const ids = await prepararCiclo1()
    const sortear = async (i: number) => {
      const dia = DIAS[i] ?? ''
      hora(dia)
      const r = await dono.rodada.findFirstOrThrow({
        where: { sequencia: i + 1, status: 'AGENDADA' },
      })
      await executarRodada(r.id, null, () => 0)
      await pagarTudo(instanteLocal(dia, '18:00'))
    }
    await sortear(0)
    await sortear(1)
    const [a = '', b = '', c = ''] = ids
    const aprovar = async (e: Parameters<typeof convocar>[1]) => {
      const { votacaoId } = await convocar(ctxDe(a, agora()), e)
      for (const x of [a, b, c]) await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
    }
    await aprovar({
      assunto: 'CONTINUIDADE_CONSORCIO',
      proposicao: 'Encerrar o consórcio ao fim do ciclo 1',
      justificativa: 'Decisão da família',
      efeito: { tipo: 'CONTINUIDADE_CONSORCIO', acao: 'ENCERRAR_AO_FIM_DO_CICLO' },
    })
    expect((await dono.ciclo.findUniqueOrThrow({ where: { numero: 1 } })).semCicloSeguinte).toBe(
      true,
    )
    for (const i of [2, 3, 4]) await sortear(i)
    expect((await dono.ciclo.findUniqueOrThrow({ where: { numero: 1 } })).status).toBe('ENCERRADO')
    expect(await dono.ciclo.count({ where: { numero: 2 } })).toBe(0)

    const rodadas = await dono.rodada.findMany({ orderBy: { sequencia: 'asc' } })
    await dono.rodada.updateMany({
      where: { sequencia: { lt: 5 } },
      data: { status: 'FECHADA', sobraCentavos: 0 },
    })
    const ultima = rodadas[4]
    await aprovar({
      assunto: 'CASO_OMISSO',
      proposicao: 'Converter o prêmio da última rodada em SOBRA',
      justificativa: 'Ninguém comprou o jogo',
      efeito: { tipo: 'CONVERTER_PREMIO_EM_SOBRA', rodadaId: ultima?.id ?? '' },
    })
    const cotas = await dono.obrigacao.findMany({ where: { tipo: 'RATEIO_SOBRA' } })
    expect(cotas).toHaveLength(5)
    expect(cotas.every((o) => o.valorCentavos === 2500)).toBe(true)
    expect(cotas.filter((o) => o.autoquitada).map((o) => o.credorId)).toEqual([
      ultima?.contempladoId,
    ])
  })

  it('CA-179: versão com outro horário em vigor → o tick reagenda as agendadas, menos a substituta', async () => {
    await prepararCiclo1()
    hora('2026-10-03')
    const r1 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
    await executarRodada(r1.id, null, () => 0)
    const v10 = await dono.versaoRegulamento.findFirstOrThrow({ where: { ordem: 0 } })
    await dono.versaoRegulamento.create({
      data: {
        ordem: 1,
        numero: '1.1',
        textoMarkdown: v10.textoMarkdown,
        parametros: { ...(v10.parametros as object), horaSorteio: '20:00' },
        sha256: 'a'.repeat(64),
        vigenteDesde: instanteLocal('2026-11-01'),
      },
    })
    const r2 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 2 } })
    const ctx = { ator: { tipo: 'SISTEMA' as const }, agora: agora() }
    await dono.rodada.update({ where: { id: r2.id }, data: { rodadaAnuladaId: r1.id } })
    expect(await recalcularAgendamentos(ctx)).toBe(0) // substituta: fixa
    await dono.rodada.update({ where: { id: r2.id }, data: { rodadaAnuladaId: null } })
    expect(await recalcularAgendamentos(ctx)).toBe(1)
    expect((await dono.rodada.findUniqueOrThrow({ where: { id: r2.id } })).agendadaPara).toEqual(
      instanteLocal('2026-11-03', '20:00'),
    )
  })
})
