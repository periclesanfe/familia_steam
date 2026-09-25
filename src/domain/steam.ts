// RN-STM-07/08 e 14 SEG-04: regras puras da integração Steam.

export type ItemWishlist = { appid: number; priority: number; date_added: number }

/**
 * RN-STM-07: `priority` não é ranking único (há zeros e repetidos). Ordem: priority > 0 crescente
 * (empate por date_added), depois os 0 por date_added. Devolve com a posição 1..n.
 */
export function ordenarListaDesejos(itens: readonly ItemWishlist[]) {
  const comPrioridade = itens
    .filter((i) => i.priority > 0)
    .sort((a, b) => a.priority - b.priority || a.date_added - b.date_added)
  const semPrioridade = itens
    .filter((i) => i.priority <= 0)
    .sort((a, b) => a.date_added - b.date_added)
  return [...comPrioridade, ...semPrioridade].map((i, k) => ({ ...i, posicao: k + 1 }))
}

/** SEG-04: link colado nunca vira fetch — só se extrai o appId (ou se aceita o número). */
export function appIdDeTexto(texto: string): number | null {
  const t = texto.trim()
  const m =
    /^https?:\/\/store\.steampowered\.com\/app\/(\d{1,9})(?:[/?#].*)?$/i.exec(t) ??
    /^(\d{1,9})$/.exec(t)
  const n = m?.[1] ? Number(m[1]) : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/** SEG-04: só imagens https de *.steamstatic.com; o resto vira null (fallback visual). */
export function imagemSteamSegura(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' &&
      (u.hostname === 'steamstatic.com' || u.hostname.endsWith('.steamstatic.com'))
      ? u.toString()
      : null
  } catch {
    return null
  }
}
