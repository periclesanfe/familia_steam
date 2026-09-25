import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instanteLocal } from '@/domain/tempo'
import { executarRodada } from '@/features/rodadas/servico'
import { declararImpossibilidade, sairDaFamilia, sairDoConsorcio } from '@/features/saidas/servico'
import { convocar, votar } from '@/features/votacoes/servico'
import { perfilDe } from '@/server/auth/perfil'

import { dono, limpar } from './banco'
import { ctxDe, pagarTudo, prepararCiclo1 } from './fabricas'

const agora = () => new Date()
const hora = (dia: string, h = '12:00') => {
  vi.setSystemTime(instanteLocal(dia, h))
}
const sortear = async (seq: number, dia: string) => {
  hora(dia)
  const r = await dono.rodada.findFirstOrThrow({ where: { sequencia: seq, status: 'AGENDADA' } })
  await executarRodada(r.id, null, () => 0)
  await pagarTudo(instanteLocal(dia, '18:00'))
  return dono.rodada.findUniqueOrThrow({ where: { id: r.id } })
}

describe('saídas e impossibilidade (RN-SAI, RN-CAD-04/10/11)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-39: não contemplado sai no mês 2 → sem obrigação nova; prêmio seguinte 10000; N = 4', async () => {
    const ids = await prepararCiclo1()
    const r1 = await sortear(1, '2026-10-03')
    const naoContemplado = ids.find((x) => x !== r1.contempladoId) ?? ''
    hora('2026-10-20')
    await sairDoConsorcio(ctxDe(naoContemplado, agora()))
    const r2 = await sortear(2, '2026-11-03')
    expect(r2.pagantesNoCorte).toBe(4)
    expect(
      await dono.obrigacao.count({ where: { rodadaId: r2.id, devedorId: naoContemplado } }),
    ).toBe(0)
    expect(await perfilDe(naoContemplado)).toMatchObject({ perfil: 'EX_QUITADO' })
    const { votacaoId } = await convocar(
      ctxDe(ids.find((x) => x !== naoContemplado) ?? '', agora()),
      {
        assunto: 'OUTRO',
        proposicao: 'Registrar decisão depois da saída',
        justificativa: 'Teste do quórum',
        efeito: { tipo: 'NENHUM' },
      },
    )
    expect(await dono.votacao.findUniqueOrThrow({ where: { id: votacaoId } })).toMatchObject({
      n: 4,
      quorum: 3,
    })
  })

  it('CA-40: contemplado no mês 1 sai no mês 3 → continua pagante nas rodadas seguintes; EX_COM_PENDENCIA', async () => {
    await prepararCiclo1()
    const r1 = await sortear(1, '2026-10-03')
    const d = r1.contempladoId ?? ''
    await sortear(2, '2026-11-03')
    hora('2026-11-20')
    await sairDoConsorcio(ctxDe(d, agora()))
    hora('2026-12-03') // sorteio da rodada 3 sem ninguém pagar ainda
    const r3a = await dono.rodada.findFirstOrThrow({ where: { sequencia: 3, status: 'AGENDADA' } })
    await executarRodada(r3a.id, null, () => 0)
    expect(await dono.obrigacao.count({ where: { rodadaId: r3a.id, devedorId: d } })).toBe(1)
    expect((await perfilDe(d))?.perfil).toBe('EX_COM_PENDENCIA') // deve a contribuição de dezembro
  })

  it('CA-42: o último não contemplado sai → ciclo EM_REVISAO; rodada agendada CANCELADA; próximo ciclo em 03/01', async () => {
    const ids = await prepararCiclo1()
    const dias = ['2026-10-03', '2026-11-03', '2026-12-03', '2027-01-03']
    const contemplados: string[] = []
    for (const [i, dia] of dias.entries()) {
      const r = await sortear(i + 1, dia)
      contemplados.push(r.contempladoId ?? '')
    }
    const ultimo = ids.find((x) => !contemplados.includes(x)) ?? ''
    hora('2027-01-30', '10:00')
    await sairDoConsorcio(ctxDe(ultimo, agora()))
    const c1 = await dono.ciclo.findUniqueOrThrow({
      where: { numero: 1 },
      include: { rodadas: true },
    })
    expect(c1.status).toBe('EM_REVISAO')
    expect(c1.rodadas.find((r) => r.sequencia === 5)?.status).toBe('CANCELADA')
    const c2 = await dono.ciclo.findUniqueOrThrow({ where: { numero: 2 } })
    expect(c2.dataInicio.toISOString().slice(0, 10)).toBe('2027-03-03') // 30/01 + 8 dias → 07/02 → 03/03
  })

  it('CA-43: integrante que entrou em 29/02/2028 sai da família em 10/03/2028 → vaga bloqueada até 28/02/2029', async () => {
    const [ana = ''] = await prepararCiclo1()
    await dono.integranteFamilia.updateMany({
      where: { pessoaId: ana },
      data: { entrouEm: new Date('2028-02-29T00:00:00Z') },
    })
    hora('2028-03-10')
    await sairDaFamilia(ctxDe(ana, agora()))
    const i = await dono.integranteFamilia.findFirstOrThrow({ where: { pessoaId: ana } })
    expect(i.status).toBe('SAIU')
    expect(i.vagaBloqueadaAte?.toISOString().slice(0, 10)).toBe('2029-02-28')
    expect(await dono.membro.findFirstOrThrow({ where: { pessoaId: ana } })).toMatchObject({
      status: 'ENCERRADO',
      motivoEncerramento: 'SAIDA_DA_FAMILIA',
    })
  })

  it('CA-44 e CA-45: impossibilidade no dia 1 → fora do sorteio do dia 3, paga a contribuição; art. 30 com escopo família', async () => {
    const ids = await prepararCiclo1()
    await sortear(1, '2026-10-03')
    const r1 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
    const alvo = ids.find((x) => x !== r1.contempladoId) ?? ''
    hora('2026-11-01')
    await declararImpossibilidade(ctxDe(alvo, agora()))
    const r2 = await sortear(2, '2026-11-03')
    const s = await dono.sorteio.findFirstOrThrow({ where: { rodadaId: r2.id } })
    expect(s.elegiveisIds).not.toContain(alvo)
    expect(await dono.obrigacao.count({ where: { rodadaId: r2.id, devedorId: alvo } })).toBe(1)

    const eleitores = ids.filter((x) => x !== alvo)
    const { votacaoId } = await convocar(ctxDe(eleitores[0] ?? '', agora()), {
      assunto: 'PERMANENCIA_ART30',
      proposicao: 'Excluir do consórcio e da família',
      justificativa: 'Impossibilidade prolongada',
      efeito: { tipo: 'PERMANENCIA_ART30', pessoaId: alvo, escopo: 'CONSORCIO_E_FAMILIA' },
    })
    await expect(votar(ctxDe(alvo, agora()), { votacaoId, opcao: 'CONTRA' })).rejects.toMatchObject(
      { codigo: 'ELEITOR_INVALIDO' },
    )
    for (const x of eleitores.slice(0, 3)) {
      await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
    }
    expect(await dono.membro.findFirstOrThrow({ where: { pessoaId: alvo } })).toMatchObject({
      status: 'ENCERRADO',
      motivoEncerramento: 'EXCLUSAO_ART30',
    })
    expect(
      (await dono.integranteFamilia.findFirstOrThrow({ where: { pessoaId: alvo } })).status,
    ).toBe('REMOCAO_AUTORIZADA')
  })
})
