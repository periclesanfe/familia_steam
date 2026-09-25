import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as baixarAnexo } from '@/app/api/anexos/[id]/route'
import { instanteLocal } from '@/domain/tempo'
import {
  extrato,
  gradeDoCiclo,
  pagamentosDaRodada,
  quemDeveAQuem,
} from '@/features/financeiro/consultas'
import { exportar } from '@/features/financeiro/exportacao'
import { executarRodada } from '@/features/rodadas/servico'
import { salvarAnexo } from '@/server/anexos'
import { hashToken } from '@/server/auth/sessao'
import { FAMILIA_PADRAO } from '@/server/familia'
import { emTransacao } from '@/server/tx'

import { contarConsultas, dono, limpar } from './banco'
import { ctxDe, pagarTudo, prepararCiclo1 } from './fabricas'

const cookie = vi.hoisted(() => ({ valor: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (cookie.valor ? { value: cookie.valor } : undefined) }),
}))

async function meses(n: number) {
  const dias = ['2026-10-03', '2026-11-03', '2026-12-03', '2027-01-03', '2027-02-03'].slice(0, n)
  for (const [i, dia] of dias.entries()) {
    vi.setSystemTime(instanteLocal(dia, '12:00'))

    const r = await dono.rodada.findFirstOrThrow({
      where: { sequencia: i + 1, status: 'AGENDADA' },
    })

    await executarRodada(r.id, null, () => 0)

    await pagarTudo(instanteLocal(dia, '18:00'))
  }
}

describe('consultas financeiras', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-178 / DP-16: o nº de consultas não cresce com o volume (1 × 4 rodadas)', async () => {
    const ids = await prepararCiclo1()
    const [ana = ''] = ids
    await meses(1)
    const agora = new Date()
    const r1 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
    const poucos = {
      extrato: await contarConsultas(() => extrato(ana, agora)),
      quemDeve: await contarConsultas(() => quemDeveAQuem(agora)),
      grade: await contarConsultas(() => gradeDoCiclo(1, agora)),
      rodada: await contarConsultas(() => pagamentosDaRodada(r1.id, agora)),
    }
    await limpar()
    await prepararCiclo1()
    await meses(4)
    const ana2 = (await dono.pessoa.findFirstOrThrow({ where: { apelido: 'Ana' } })).id
    const agora2 = new Date()
    const r1b = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
    const muitos = {
      extrato: await contarConsultas(() => extrato(ana2, agora2)),
      quemDeve: await contarConsultas(() => quemDeveAQuem(agora2)),
      grade: await contarConsultas(() => gradeDoCiclo(1, agora2)),
      rodada: await contarConsultas(() => pagamentosDaRodada(r1b.id, agora2)),
    }
    expect(muitos).toEqual(poucos)
    expect(await dono.obrigacao.count()).toBe(20)
  })

  it('exportação: MEMBRO leva tudo menos sessões, nonces e bytes; EX_* só o que é dele', async () => {
    const ids = await prepararCiclo1()
    await meses(1)
    const [ana = '', bruno = ''] = ids
    await emTransacao((tx) =>
      salvarAnexo(
        tx,
        ctxDe(ana, new Date()),
        'COMPROVANTE_PIX',
        new File([new Uint8Array([0xff, 0xd8, 0xff, 9])], 'x.jpg'),
      ),
    )
    const membro = await exportar({
      pessoaId: ana,
      perfil: 'MEMBRO',
      familiaId: FAMILIA_PADRAO,
      membroId: 'm',
      statusMembro: 'ATIVO',
    })
    expect(Object.keys(membro)).not.toEqual(
      expect.arrayContaining(['sessao', 'nonceOpenId', 'controle']),
    )
    expect(membro.anexo?.[0]).not.toHaveProperty('conteudo')
    expect(membro.obrigacao).toHaveLength(5)
    const ex = await exportar({
      pessoaId: bruno,
      perfil: 'EX_QUITADO',
      familiaId: FAMILIA_PADRAO,
      membroId: 'm',
      statusMembro: 'ENCERRADO',
    })
    expect(ex.pessoa?.map((p) => p.id)).toEqual([bruno])
    expect(ex.obrigacao?.every((o) => o.devedorId === bruno || o.credorId === bruno)).toBe(true)
    expect(ex.pagamento?.[0]).not.toHaveProperty('chavePixDestinoMascarada')
  })

  it('CA-175 (download): sandbox, nosniff, no-store e nome gerado; sem sessão é 404', async () => {
    const [ana = ''] = await prepararCiclo1()
    const { id } = await emTransacao((tx) =>
      salvarAnexo(
        tx,
        ctxDe(ana, new Date()),
        'COMPROVANTE_PIX',
        new File([new Uint8Array([0xff, 0xd8, 0xff, 1])], '../../etc/passwd.jpg'),
      ),
    )
    const params = Promise.resolve({ id })
    cookie.valor = undefined
    expect((await baixarAnexo(new Request('http://x'), { params })).status).toBe(404)

    const token = 'token-de-teste-com-tamanho-suficiente-000'
    await dono.sessao.create({
      data: {
        tokenHash: hashToken(token),
        pessoaId: ana,
        criadaEm: new Date(),
        expiraEm: new Date('2030-01-01'),
      },
    })
    cookie.valor = token
    const res = await baixarAnexo(new Request('http://x'), { params })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toBe('sandbox')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('content-disposition')).toBe(`inline; filename="anexo-${id}.jpg"`)
  })
})
