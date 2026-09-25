import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as loginDev } from '@/app/api/auth/dev/route'
import { GET as callback } from '@/app/api/auth/steam/callback/route'
import { entrarComSteam } from '@/features/autenticacao/servico'
import { OP_ENDPOINT, urlDeRetorno } from '@/server/auth/openid'
import { perfilDe } from '@/server/auth/perfil'
import { hashToken, revogarSessoes } from '@/server/auth/sessao'

import { criarMembro, criarPessoa, dono, limpar } from './banco'

const STEAM = '76561197960287930'
const agora = new Date()

describe('autenticação (RN-ACE-04/05, RN-STM-01)', () => {
  beforeEach(limpar)
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('membro entra: nonce gravado, sessão com hash e auditoria', async () => {
    const { pessoa } = await criarMembro('ATIVO')
    const r = await entrarComSteam({ steamId64: STEAM, nonce: 'n1', userAgent: 'x', agora })
    expect(r).toMatchObject({ tipo: 'OK', perfil: 'MEMBRO' })
    if (r.tipo !== 'OK') return
    const s = await dono.sessao.findFirstOrThrow({ where: { pessoaId: pessoa.id } })
    expect(s.tokenHash).toBe(hashToken(r.token))
    expect(s.tokenHash).not.toBe(r.token)
    expect(await dono.eventoAuditoria.count({ where: { acao: 'sessao.criar' } })).toBe(1)
  })

  it('CA-98: SteamID fora da lista (ou integrante sem vínculo de membro) → não autorizado + auditoria', async () => {
    await criarPessoa('Kid', '76561197960287999') // integrante não membro
    for (const steamId64 of ['76561197960287999', '76561198000000000']) {
      const r = await entrarComSteam({ steamId64, nonce: `n-${steamId64}`, userAgent: null, agora })
      expect(r).toEqual({ tipo: 'NAO_AUTORIZADO' })
    }
    expect(await dono.eventoAuditoria.count({ where: { acao: 'auth.nao_autorizado' } })).toBe(2)
    expect(await dono.sessao.count()).toBe(0)
  })

  it('CA-99: reuso do mesmo response_nonce é recusado', async () => {
    await criarMembro('ATIVO')
    await entrarComSteam({ steamId64: STEAM, nonce: 'repetido', userAgent: null, agora })
    const r = await entrarComSteam({ steamId64: STEAM, nonce: 'repetido', userAgent: null, agora })
    expect(r).toEqual({ tipo: 'REPLAY' })
    expect(await dono.sessao.count()).toBe(1)
  })

  it('perfis derivados: PENDENTE, MEMBRO, EX_QUITADO e sem vínculo', async () => {
    const pend = await criarMembro('AGUARDANDO_ADESAO', 'Bia', '76561197960287931')
    const ativo = await criarMembro('IMPOSSIBILITADO', 'Caio', '76561197960287932')
    const ex = await criarMembro('ENCERRADO', 'Duda', '76561197960287933')
    const sem = await criarPessoa('Kid', '76561197960287934')
    expect((await perfilDe(pend.pessoa.id))?.perfil).toBe('PENDENTE')
    expect((await perfilDe(ativo.pessoa.id))?.perfil).toBe('MEMBRO')
    expect((await perfilDe(ex.pessoa.id))?.perfil).toBe('EX_QUITADO')
    expect(await perfilDe(sem.id)).toBeNull()
  })

  it('sair de todos revoga todas as sessões da pessoa', async () => {
    const { pessoa } = await criarMembro('ATIVO')
    await entrarComSteam({ steamId64: STEAM, nonce: 'a', userAgent: null, agora })
    await entrarComSteam({ steamId64: STEAM, nonce: 'b', userAgent: null, agora })
    const ctx = { ator: { tipo: 'MEMBRO' as const, pessoaId: pessoa.id }, agora }
    expect(await revogarSessoes(ctx, { todasDe: pessoa.id })).toBe(2)
    expect(await dono.sessao.count({ where: { revogadaEm: null } })).toBe(0)
  })

  it('CA-104: /api/auth/dev responde 404 em produção e sem DEV_LOGIN', async () => {
    await criarMembro('ATIVO')
    const req = () => new NextRequest(`http://localhost:3100/api/auth/dev?steamId64=${STEAM}`)
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEV_LOGIN', '1')
    expect((await loginDev(req())).status).toBe(404)
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DEV_LOGIN', '0')
    expect((await loginDev(req())).status).toBe(404)
    vi.stubEnv('DEV_LOGIN', '1')
    const ok = await loginDev(req())
    expect(ok.status).toBe(307)
    expect(ok.cookies.get('sessao')?.httpOnly).toBe(true)
  })

  it('callback completo: state + retorno assinado + check_authentication → sessão e cookie', async () => {
    await criarMembro('AGUARDANDO_ADESAO')
    const buscar = vi.fn(() => Promise.resolve(new Response('ns:x\nis_valid:true\n')))
    vi.stubGlobal('fetch', buscar)
    const app = 'http://localhost:3100'
    const q = new URLSearchParams({
      state: 's1',
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'id_res',
      'openid.op_endpoint': OP_ENDPOINT,
      'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM}`,
      'openid.identity': `https://steamcommunity.com/openid/id/${STEAM}`,
      'openid.return_to': urlDeRetorno(app, 's1'),
      'openid.response_nonce': `${new Date().toISOString().slice(0, 19)}Zxyz`,
      'openid.assoc_handle': '1',
      'openid.signed':
        'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
      'openid.sig': 'x',
    })
    const req = new NextRequest(`${app}/api/auth/steam/callback?${q.toString()}`, {
      headers: { cookie: 'steam_state=s1' },
    })
    const res = await callback(req)
    expect(res.headers.get('location')).toBe(`${app}/boas-vindas`)
    expect(res.cookies.get('sessao')?.value).toBeTruthy()
    expect(res.cookies.get('steam_state')?.maxAge).toBe(0)
    expect(buscar).toHaveBeenCalledWith(OP_ENDPOINT, expect.anything())

    // o mesmo retorno de novo (replay) não entra
    const replay = await callback(
      new NextRequest(`${app}/api/auth/steam/callback?${q.toString()}`, {
        headers: { cookie: 'steam_state=s1' },
      }),
    )
    expect(replay.headers.get('location')).toBe(`${app}/entrar?erro=falha`)
  })
})
