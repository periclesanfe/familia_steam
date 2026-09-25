import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instanteLocal } from '@/domain/tempo'
import { executarRodada } from '@/features/rodadas/servico'
import { revogarTranscricao, transcrever, transcritosParaMim } from '@/features/transcricao/servico'
import { salvarAnexo } from '@/server/anexos'
import { emTransacao } from '@/server/tx'

import { dono, limpar } from './banco'
import { ctxDe, pagarTudo, prepararCiclo1 } from './fabricas'

const agora = () => new Date()
const hora = (dia: string, h = '12:00') => {
  vi.setSystemTime(instanteLocal(dia, h))
}
const jpeg = (n: number) => new File([new Uint8Array([0xff, 0xd8, 0xff, n])], 'print.jpg')

async function print(ator: string, n: number) {
  const a = await emTransacao((tx) =>
    salvarAnexo(tx, ctxDe(ator, agora()), 'EVIDENCIA_GRUPO', jpeg(n)),
  )
  return a.id
}

describe('transcrição de atos do GRUPO (RN-GER-05)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-115: A transcreve o "não concorrer" de B → B vê a pendência e revoga antes do corte', async () => {
    const [a = '', b = ''] = await prepararCiclo1()
    const r1 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
    hora('2026-10-01')
    await expect(
      transcrever(
        ctxDe(a, agora()),
        { pessoaId: a, efetivaEm: agora(), evidenciaAnexoId: await print(a, 1) },
        { tipo: 'NAO_CONCORRER', rodadaId: r1.id },
      ),
    ).rejects.toMatchObject({ codigo: 'ENTRADA_INVALIDA' }) // ato próprio: ação direta
    await transcrever(
      ctxDe(a, agora()),
      {
        pessoaId: b,
        efetivaEm: instanteLocal('2026-10-01', '09:00'),
        evidenciaAnexoId: await print(a, 2),
      },
      { tipo: 'NAO_CONCORRER', rodadaId: r1.id },
    )
    const [pendente] = await transcritosParaMim(b)
    expect(pendente).toMatchObject({ tipo: 'NAO_CONCORRER' })
    await expect(
      revogarTranscricao(ctxDe(a, agora()), { declaracaoId: pendente?.id ?? '' }),
    ).rejects.toMatchObject({ codigo: 'SEM_PERMISSAO' })
    await revogarTranscricao(ctxDe(b, agora()), { declaracaoId: pendente?.id ?? '' })
    expect(await transcritosParaMim(b)).toHaveLength(0)
  })

  it('justificativa transcrita: mensagem antes do vencimento, registrada até +48 h', async () => {
    const ids = await prepararCiclo1()
    hora('2026-10-03')
    const r1 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
    await executarRodada(r1.id, null, () => 0)
    const c = (await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).contempladoId
    const [devedor = '', ator = ''] = ids.filter((x) => x !== c)
    const o = await dono.obrigacao.findFirstOrThrow({
      where: { rodadaId: r1.id, devedorId: devedor },
    })
    const mensagem = instanteLocal('2026-10-03', '20:00')
    hora('2026-10-06', '10:00') // vencimento 04/10 00:00 + 48 h = 06/10 00:00
    const ato = {
      tipo: 'JUSTIFICATIVA_PRORROGACAO' as const,
      obrigacaoId: o.id,
      texto: 'Viagem sem internet',
    }
    await expect(
      transcrever(
        ctxDe(ator, agora()),
        { pessoaId: devedor, efetivaEm: mensagem, evidenciaAnexoId: await print(ator, 3) },
        ato,
      ),
    ).rejects.toMatchObject({ codigo: 'JUSTIFICATIVA_FORA_DO_PRAZO' })
    hora('2026-10-05', '10:00')
    await transcrever(
      ctxDe(ator, agora()),
      { pessoaId: devedor, efetivaEm: mensagem, evidenciaAnexoId: await print(ator, 4) },
      ato,
    )
    expect(await dono.obrigacao.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      justificadaEm: mensagem,
    })
  })

  it('CA-162: CONFIRMA transcrita às 08:00 do dia 3 ou com a mensagem à 01:00 do dia 3 → recusada', async () => {
    const ids = await prepararCiclo1()
    const dias = ['2026-10-03', '2026-11-03', '2026-12-03', '2027-01-03', '2027-02-03']
    for (const [i, dia] of dias.entries()) {
      hora(dia)
      const r = await dono.rodada.findFirstOrThrow({
        where: { sequencia: i + 1, status: 'AGENDADA' },
      })
      await executarRodada(r.id, null, () => 0)
      await pagarTudo(instanteLocal(dia, '18:00'))
    }
    const c2 = await dono.ciclo.findUniqueOrThrow({ where: { numero: 2 } })
    const [a = '', b = ''] = ids
    const confirma = { tipo: 'CONFIRMA_PROXIMO_CICLO' as const, cicloId: c2.id }
    hora('2027-03-03', '08:00')
    await expect(
      transcrever(
        ctxDe(a, agora()),
        {
          pessoaId: b,
          efetivaEm: instanteLocal('2027-03-02', '20:00'),
          evidenciaAnexoId: await print(a, 5),
        },
        confirma,
      ),
    ).rejects.toMatchObject({ codigo: 'ENTRADA_INVALIDA' })
    hora('2027-03-02', '23:00')
    await expect(
      transcrever(
        ctxDe(a, agora()),
        { pessoaId: b, efetivaEm: agora(), evidenciaAnexoId: await print(a, 6) },
        confirma,
      ),
    ).resolves.toBeUndefined()
    // mensagem à 01:00 do dia 3 só se registra depois do prazo: cai no primeiro caso
    // o sujeito revoga depois do prazo, até o corte
    hora('2027-03-03', '10:00')
    const [pendente] = await transcritosParaMim(b)
    await revogarTranscricao(ctxDe(b, agora()), { declaracaoId: pendente?.id ?? '' })
    expect(await transcritosParaMim(b)).toHaveLength(0)
  })
})
