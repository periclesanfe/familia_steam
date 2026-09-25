// 07 §3.7: diferenças entre a versão vigente e o texto proposto (RN-REG-03).

export type LinhaDiff = { tipo: 'igual' | 'removida' | 'incluida'; texto: string }

/**
 * Diff por linhas pela maior subsequência comum.
 * ponytail: O(n·m) em tempo e memória; o Regulamento tem ~300 linhas. Trocar por Myers se
 * o texto passar de alguns milhares de linhas.
 */
export function diffLinhas(antes: string, depois: string): LinhaDiff[] {
  const a = antes.split('\n')
  const b = depois.split('\n')
  const n = a.length
  const m = b.length
  const lcs = new Uint32Array((n + 1) * (m + 1))
  const at = (i: number, j: number) => lcs[i * (m + 1) + j] ?? 0
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * (m + 1) + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }
  const saida: LinhaDiff[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      saida.push({ tipo: 'igual', texto: a[i] ?? '' })
      i++
      j++
    } else if (i < n && (j >= m || at(i + 1, j) >= at(i, j + 1))) {
      saida.push({ tipo: 'removida', texto: a[i] ?? '' })
      i++
    } else {
      saida.push({ tipo: 'incluida', texto: b[j] ?? '' })
      j++
    }
  }
  return saida
}

/** Só as mudanças com `contexto` linhas iguais em volta; o resto vira um marcador de omissão. */
export function trechosDoDiff(
  linhas: readonly LinhaDiff[],
  contexto = 2,
): (LinhaDiff | { tipo: 'omitidas'; quantidade: number })[] {
  const perto = linhas.map((_, k) =>
    linhas.slice(Math.max(0, k - contexto), k + contexto + 1).some((l) => l.tipo !== 'igual'),
  )
  const saida: (LinhaDiff | { tipo: 'omitidas'; quantidade: number })[] = []
  let omitidas = 0
  for (const [k, l] of linhas.entries()) {
    if (perto[k]) {
      if (omitidas > 0) saida.push({ tipo: 'omitidas', quantidade: omitidas })
      omitidas = 0
      saida.push(l)
    } else omitidas++
  }
  if (omitidas > 0) saida.push({ tipo: 'omitidas', quantidade: omitidas })
  return saida
}
