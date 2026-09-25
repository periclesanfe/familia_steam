import { describe, expect, it, vi } from 'vitest'

import {
  OP_ENDPOINT,
  corpoVerificacao,
  respostaValida,
  urlDeLogin,
  urlDeRetorno,
  validarRetorno,
  verificarNaSteam,
} from './openid'

const APP = 'https://consorcio.exemplo.com'
const STATE = 'abc123'
const agora = new Date('2026-10-03T15:00:00Z')
const STEAM = '76561197960287930'

function retorno(ajustes: Record<string, string | null> = {}, extras: [string, string][] = []) {
  const base: Record<string, string> = {
    state: STATE,
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': OP_ENDPOINT,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM}`,
    'openid.return_to': urlDeRetorno(APP, STATE),
    'openid.response_nonce': '2026-10-03T14:59:00ZabcDEF',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'assinatura=',
  }
  for (const [k, v] of Object.entries(ajustes)) {
    if (v === null) Reflect.deleteProperty(base, k)
    else base[k] = v
  }
  const q = new URLSearchParams(base)
  for (const [k, v] of extras) q.append(k, v)
  return q
}
const validar = (q: URLSearchParams, stateCookie: string | null = STATE) =>
  validarRetorno(q, { appUrl: APP, stateCookie: stateCookie ?? undefined, agora })

describe('OpenID Steam (RN-STM-01/02)', () => {
  it('redirect com identifier_select e return_to com o state', () => {
    const u = new URL(urlDeLogin(APP, STATE))
    expect(u.origin + u.pathname).toBe(OP_ENDPOINT)
    expect(u.searchParams.get('openid.mode')).toBe('checkid_setup')
    expect(u.searchParams.get('openid.realm')).toBe(APP)
    expect(u.searchParams.get('openid.return_to')).toBe(
      `${APP}/api/auth/steam/callback?state=abc123`,
    )
  })

  it('aceita o retorno correto', () => {
    const r = validar(retorno())
    expect(r).toMatchObject({ ok: true, steamId64: STEAM, nonce: '2026-10-03T14:59:00ZabcDEF' })
  })

  it('CA-100: claimed_id com http:// é aceito; com outro host é recusado', () => {
    const http = `http://steamcommunity.com/openid/id/${STEAM}`
    expect(validar(retorno({ 'openid.claimed_id': http, 'openid.identity': http })).ok).toBe(true)
    const outro = `https://steamcommunity.com.evil.io/openid/id/${STEAM}`
    expect(validar(retorno({ 'openid.claimed_id': outro, 'openid.identity': outro }))).toEqual({
      ok: false,
      motivo: 'CLAIMED_ID',
    })
  })

  it('CA-118: claimed_id duplicado, signed sem claimed_id e is_valid:truex são recusados', () => {
    const dup = retorno({}, [
      ['openid.claimed_id', 'https://steamcommunity.com/openid/id/76561197960287931'],
    ])
    expect(validar(dup)).toEqual({ ok: false, motivo: 'PARAMETRO_REPETIDO' })
    const semClaimed = retorno({
      'openid.signed': 'signed,op_endpoint,identity,return_to,response_nonce,assoc_handle',
    })
    expect(validar(semClaimed)).toEqual({ ok: false, motivo: 'ASSINATURA_INCOMPLETA' })
    expect(respostaValida('ns:http://specs.openid.net/auth/2.0\nis_valid:truex\n')).toBe(false)
    expect(respostaValida('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n')).toBe(true)
    expect(respostaValida('is_valid:false')).toBe(false)
  })

  it('state ausente, diferente ou sem cookie é recusado', () => {
    expect(validar(retorno(), null)).toEqual({ ok: false, motivo: 'STATE' })
    expect(validar(retorno({ state: 'outro' }))).toEqual({ ok: false, motivo: 'STATE' })
    expect(validar(retorno({}, [['state', STATE]]))).toEqual({
      ok: false,
      motivo: 'PARAMETRO_REPETIDO',
    })
  })

  it('modo, op_endpoint e return_to adulterados são recusados', () => {
    expect(validar(retorno({ 'openid.mode': 'cancel' }))).toMatchObject({ motivo: 'MODO' })
    expect(
      validar(retorno({ 'openid.op_endpoint': 'https://evil.io/openid/login' })),
    ).toMatchObject({
      motivo: 'OP_ENDPOINT',
    })
    expect(
      validar(retorno({ 'openid.return_to': 'https://evil.io/cb?state=abc123' })),
    ).toMatchObject({
      motivo: 'RETURN_TO',
    })
    expect(
      validar(
        retorno({ 'openid.identity': 'https://steamcommunity.com/openid/id/76561197960287931' }),
      ),
    ).toMatchObject({
      motivo: 'CLAIMED_ID',
    })
  })

  it('nonce velho (> 5 min), do futuro (> 1 min) ou malformado é recusado', () => {
    expect(validar(retorno({ 'openid.response_nonce': '2026-10-03T14:54:59Zx' }))).toMatchObject({
      motivo: 'NONCE',
    })
    expect(validar(retorno({ 'openid.response_nonce': '2026-10-03T15:01:01Zx' }))).toMatchObject({
      motivo: 'NONCE',
    })
    expect(validar(retorno({ 'openid.response_nonce': 'lixo' }))).toMatchObject({ motivo: 'NONCE' })
  })

  it('check_authentication vai para a constante, com o mesmo mapa e sem seguir redirect', async () => {
    const r = validar(retorno())
    if (!r.ok) throw new Error('esperado ok')
    const corpo = corpoVerificacao(r.parametros)
    expect(corpo.get('openid.mode')).toBe('check_authentication')
    expect(corpo.get('openid.claimed_id')).toBe(`https://steamcommunity.com/openid/id/${STEAM}`)
    expect(corpo.has('state')).toBe(false)

    const buscar = vi.fn(() => Promise.resolve(new Response('is_valid:true\n')))
    expect(await verificarNaSteam(r.parametros, buscar)).toBe(true)
    expect(buscar).toHaveBeenCalledWith(
      OP_ENDPOINT,
      expect.objectContaining({ method: 'POST', redirect: 'error' }),
    )
    const falso = vi.fn(() => Promise.resolve(new Response('is_valid:true', { status: 500 })))
    expect(await verificarNaSteam(r.parametros, falso)).toBe(false)
  })
})
