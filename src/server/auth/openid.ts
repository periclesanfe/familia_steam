// Login com Steam, OpenID 2.0 (06 §2, RN-STM-01/02). Parte pura, testada com parâmetros
// adulterados; a única chamada externa (check_authentication) recebe o fetch por injeção.

export const OP_ENDPOINT = 'https://steamcommunity.com/openid/login'
const NS = 'http://specs.openid.net/auth/2.0'
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select'
const CLAIMED_ID = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/
const ASSINADOS = [
  'op_endpoint',
  'claimed_id',
  'identity',
  'return_to',
  'response_nonce',
  'assoc_handle',
]
const NONCE_MAX_IDADE_MS = 5 * 60_000
const NONCE_MAX_FUTURO_MS = 60_000

export const urlDeRetorno = (appUrl: string, state: string): string =>
  `${appUrl.replace(/\/$/, '')}/api/auth/steam/callback?state=${encodeURIComponent(state)}`

/** RN-STM-02: redirect para a Steam. */
export function urlDeLogin(appUrl: string, state: string): string {
  const u = new URL(OP_ENDPOINT)
  u.search = new URLSearchParams({
    'openid.ns': NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': urlDeRetorno(appUrl, state),
    'openid.realm': appUrl.replace(/\/$/, ''),
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  }).toString()
  return u.toString()
}

export type MotivoFalha =
  | 'PARAMETRO_REPETIDO'
  | 'STATE'
  | 'MODO'
  | 'OP_ENDPOINT'
  | 'RETURN_TO'
  | 'CLAIMED_ID'
  | 'ASSINATURA_INCOMPLETA'
  | 'NONCE'

export type RetornoValidado = {
  ok: true
  steamId64: string
  nonce: string
  /** O mesmo mapa que produziu o claimed_id vai para o check_authentication (item 1). */
  parametros: ReadonlyMap<string, string>
}

/** Itens 1 a 8 da RN-STM-01 (o 9, check_authentication, e o 10, lista, vêm depois). */
export function validarRetorno(
  query: URLSearchParams,
  esperado: { appUrl: string; stateCookie: string | undefined; agora: Date },
): RetornoValidado | { ok: false; motivo: MotivoFalha } {
  const falha = (motivo: MotivoFalha) => ({ ok: false as const, motivo })

  // 1. mapa único: nenhuma chave openid.* (nem o state) pode aparecer duas vezes
  const mapa = new Map<string, string>()
  for (const [k, v] of query) {
    if (k !== 'state' && !k.startsWith('openid.')) continue
    if (mapa.has(k)) return falha('PARAMETRO_REPETIDO')
    mapa.set(k, v)
  }
  const p = (k: string) => mapa.get(`openid.${k}`)

  // 2. state da query igual ao do cookie
  const state = mapa.get('state')
  if (!esperado.stateCookie || !state || state !== esperado.stateCookie) return falha('STATE')
  mapa.delete('state')

  // 3 e 4
  if (p('ns') !== NS || p('mode') !== 'id_res') return falha('MODO')
  if (p('op_endpoint') !== OP_ENDPOINT) return falha('OP_ENDPOINT')

  // 5. return_to exatamente o nosso callback com o state do cookie
  if (p('return_to') !== urlDeRetorno(esperado.appUrl, esperado.stateCookie)) {
    return falha('RETURN_TO')
  }

  // 6. claimed_id da Steam, igual à identity
  const claimed = p('claimed_id') ?? ''
  const id = CLAIMED_ID.exec(claimed)?.[1]
  if (!id || p('identity') !== claimed) return falha('CLAIMED_ID')

  // 7. os campos que usamos precisam estar assinados
  const assinados = new Set((p('signed') ?? '').split(','))
  if (!ASSINADOS.every((c) => assinados.has(c))) return falha('ASSINATURA_INCOMPLETA')

  // 8. nonce recente (o anti-replay no banco vem depois)
  const nonce = p('response_nonce') ?? ''
  const emitido = Date.parse(nonce.slice(0, 20))
  const idade = esperado.agora.getTime() - emitido
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(nonce) || Number.isNaN(emitido)) {
    return falha('NONCE')
  }
  if (idade > NONCE_MAX_IDADE_MS || idade < -NONCE_MAX_FUTURO_MS) return falha('NONCE')

  return { ok: true, steamId64: id, nonce, parametros: mapa }
}

/** Item 9: corpo do check_authentication, a partir do mesmo mapa. */
export function corpoVerificacao(parametros: ReadonlyMap<string, string>): URLSearchParams {
  const corpo = new URLSearchParams([...parametros])
  corpo.set('openid.mode', 'check_authentication')
  return corpo
}

/** Resposta "chave:valor" por linha; só vale `is_valid:true` exato. */
export function respostaValida(texto: string): boolean {
  return texto.split('\n').some((linha) => linha.trim() === 'is_valid:true')
}

export async function verificarNaSteam(
  parametros: ReadonlyMap<string, string>,
  buscar: typeof fetch = fetch,
): Promise<boolean> {
  // sempre para a constante, nunca para um endpoint recebido (item 9)
  const r = await buscar(OP_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: corpoVerificacao(parametros),
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  })
  return r.status === 200 && respostaValida(await r.text())
}
