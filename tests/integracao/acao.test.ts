import { randomBytes } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ErroDeNegocio } from '@/domain/erros'
import { acao, ehAcao, lerFormulario } from '@/server/acao'
import { hashToken } from '@/server/auth/sessao'

import { criarPessoa, dono, limpar } from './banco'

const cookie = vi.hoisted(() => ({ valor: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (cookie.valor ? { value: cookie.valor } : undefined) }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const form = (dados: Record<string, string | string[]>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(dados)) for (const x of [v].flat()) fd.append(k, x)
  return fd
}

async function entrar(expiraEm = new Date(Date.now() + 86_400_000)) {
  const p = await criarPessoa()
  const token = randomBytes(32).toString('base64url')
  await dono.sessao.create({
    data: { tokenHash: hashToken(token), pessoaId: p.id, criadaEm: new Date(), expiraEm },
  })
  cookie.valor = token
  return p
}

const schema = z.object({ valor: z.coerce.number().int().positive('Informe um valor positivo') })

describe('acao() (08 §4.1, 14 SEG-01)', () => {
  beforeEach(async () => {
    await limpar()
    cookie.valor = undefined
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sem sessão → NAO_AUTENTICADO, sem chamar o handler (CA-170)', async () => {
    const handler = vi.fn()
    const r = await acao(schema, handler)(null, form({ valor: '1' }))
    expect(r).toMatchObject({ ok: false, codigo: 'NAO_AUTENTICADO' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('sessão expirada não vale', async () => {
    await entrar(new Date(Date.now() - 1000))
    const r = await acao(schema, vi.fn())(null, form({ valor: '1' }))
    expect(r).toMatchObject({ ok: false, codigo: 'NAO_AUTENTICADO' })
  })

  it('CA-04: o ator é a sessão e o instante é o relógio do servidor', async () => {
    const p = await entrar(new Date('2027-01-01T00:00:00Z'))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T15:00:00Z'))
    const r = await acao(schema, (e, ctx) => Promise.resolve({ e, ctx }))(
      null,
      form({ valor: '25', pixEm: '2030-01-01T00:00' }), // campo extra do cliente é ignorado
    )
    expect(r).toEqual({
      ok: true,
      dados: {
        e: { valor: 25 },
        ctx: { ator: { tipo: 'MEMBRO', pessoaId: p.id }, agora: new Date('2026-10-03T15:00:00Z') },
      },
    })
  })

  it('entrada inválida → erros por campo e valores de volta (12 UI-13)', async () => {
    await entrar()
    const r = await acao(schema, vi.fn())(null, form({ valor: '-3' }))
    expect(r).toMatchObject({
      ok: false,
      codigo: 'ENTRADA_INVALIDA',
      erros: { valor: ['Informe um valor positivo'] },
      valores: { valor: '-3' },
    })
  })

  it('ErroDeNegocio vira resposta com código e artigo; erro inesperado é genérico', async () => {
    await entrar()
    const negocio = await acao(schema, () =>
      Promise.reject(new ErroDeNegocio('VOTACAO_ENCERRADA')),
    )(null, form({ valor: '1' }))
    expect(negocio).toMatchObject({ ok: false, codigo: 'VOTACAO_ENCERRADA', artigo: 'art. 41' })

    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const inesperado = await acao(schema, () => Promise.reject(new Error('senha=123')))(
      null,
      form({ valor: '1' }),
    )
    expect(inesperado).toMatchObject({ ok: false, codigo: 'ERRO_INESPERADO' })
    expect(JSON.stringify(inesperado)).not.toContain('senha')
    expect(log.mock.calls.flat().join()).not.toContain('senha')
  })

  it('lerFormulario: repetidos viram lista; vazio some', () => {
    expect(lerFormulario(form({ a: ['1', '2'], b: '', c: 'x' }))).toEqual({ a: ['1', '2'], c: 'x' })
  })

  it('marca de guarda', () => {
    expect(ehAcao(acao(schema, vi.fn()))).toBe(true)
    expect(ehAcao(() => Promise.resolve())).toBe(false)
  })
})
