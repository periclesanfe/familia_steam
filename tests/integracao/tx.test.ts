import { beforeEach, describe, expect, it } from 'vitest'

import { registrarEvento, sanitizar } from '@/server/auditoria'
import { db } from '@/server/db'
import { emTransacao, travar } from '@/server/tx'

import { contarConsultas, dono, limpar } from './banco'

const ctx = { ator: { tipo: 'SISTEMA' as const }, agora: new Date('2026-10-03T15:00:00Z') }
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('transação, lock e auditoria (RN-GER-04/06)', () => {
  beforeEach(limpar)

  it('travar serializa transações com a mesma chave', async () => {
    const ordem: string[] = []
    const primeira = emTransacao(async (tx) => {
      await travar(tx, 'rodada:1')
      ordem.push('A travou')
      await espera(200)
      ordem.push('A saiu')
    })
    await espera(50)
    const segunda = emTransacao(async (tx) => {
      await travar(tx, 'rodada:1')
      ordem.push('B travou')
    })
    await Promise.all([primeira, segunda])
    expect(ordem).toEqual(['A travou', 'A saiu', 'B travou'])
  })

  it("'fechamento' depois de outro lock é erro de programação (ordem fixa)", async () => {
    await expect(
      emTransacao(async (tx) => {
        await travar(tx, 'rodada:1')
        await travar(tx, 'fechamento')
      }),
    ).rejects.toThrow(/RN-GER-06/)
  })

  it('evento de auditoria mascara Pix e descarta bytes e hash de token', async () => {
    await emTransacao((tx) =>
      registrarEvento(tx, ctx, {
        acao: 'pessoa.atualizar',
        entidade: 'pessoa',
        entidadeId: 'p1',
        dados: {
          antes: { chavePix: 'ana@exemplo.com', tokenHash: 'abc' },
          depois: { chavePix: '11999998888', conteudo: new Uint8Array([1]), em: ctx.agora },
        },
      }),
    )
    const [e] = await dono.eventoAuditoria.findMany()
    expect(e?.dados).toEqual({
      antes: { chavePix: '****.com' },
      depois: { chavePix: '****8888', em: '2026-10-03T15:00:00.000Z' },
    })
    expect(sanitizar({ chavePixDestino: '123456' })).toEqual({ chavePixDestino: '****3456' })
  })

  it('falha depois da auditoria desfaz tudo (mesma transação)', async () => {
    await expect(
      emTransacao(async (tx) => {
        await registrarEvento(tx, ctx, { acao: 'x', entidade: 'x', entidadeId: '1' })
        throw new Error('falhou no meio')
      }),
    ).rejects.toThrow('falhou no meio')
    expect(await dono.eventoAuditoria.count()).toBe(0)
  })

  it('contarConsultas: include é uma consulta por nível (13 DP-01)', async () => {
    const n = await contarConsultas(() =>
      db.pessoa.findMany({ include: { sessoes: true, membros: true } }),
    )
    expect(n).toBe(3)
  })
})
