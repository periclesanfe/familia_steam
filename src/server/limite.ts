// RN-ACE-13: limite de tentativas em memória (uma instância).
// ponytail: memória do processo; passar para o Postgres se houver mais de uma instância.
const tentativas = new Map<string, number[]>()

export function permitir(
  chave: string,
  max: number,
  janelaMs: number,
  agora = Date.now(),
): boolean {
  const recentes = (tentativas.get(chave) ?? []).filter((t) => agora - t < janelaMs)
  if (recentes.length >= max) {
    tentativas.set(chave, recentes)
    return false
  }
  recentes.push(agora)
  tentativas.set(chave, recentes)
  return true
}

/** IP do cliente: o último valor de X-Forwarded-For, gravado pelo Caddy. */
export const ipDe = (headers: Headers): string =>
  headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'local'
