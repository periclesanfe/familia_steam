import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instanteLocal } from '@/domain/tempo'
import { pendenciasDe } from '@/features/painel/pendencias'
import { executarRodada } from '@/features/rodadas/servico'
import { convocar } from '@/features/votacoes/servico'

import { contarConsultas, dono, limpar } from './banco'
import { ctxDe, pagarTudo, prepararCiclo1 } from './fabricas'

const agora = () => new Date()

describe('painel de pendências (07 §4)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('contemplado vê "avise o jogo"; eleitor vê "votar"; nº de consultas não cresce com o volume', async () => {
    const ids = await prepararCiclo1()
    vi.setSystemTime(instanteLocal('2026-10-03', '12:00'))
    const r1 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
    await executarRodada(r1.id, null, () => 0)
    const c = (await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).contempladoId ?? ''
    const outro = ids.find((x) => x !== c) ?? ''
    const antes = await contarConsultas(() => pendenciasDe(outro, agora()))

    await convocar(ctxDe(c, agora()), {
      assunto: 'OUTRO',
      proposicao: 'Registrar a data da reunião',
      justificativa: 'Organização do grupo',
      efeito: { tipo: 'NENHUM' },
    })
    await pagarTudo(instanteLocal('2026-10-03', '18:00'))
    const { minhas } = await pendenciasDe(c, agora())
    expect(minhas.map((p) => p.chave)).toContain(`avisar-${r1.id}`)
    const doOutro = await pendenciasDe(outro, agora())
    expect(doOutro.minhas.some((p) => p.chave.startsWith('votar-'))).toBe(true)
    expect(await contarConsultas(() => pendenciasDe(outro, agora()))).toBe(antes) // DP-16
  })
})
