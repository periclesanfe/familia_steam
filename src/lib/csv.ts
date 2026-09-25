// RN-ACE-12 / 14 SEG-04: CSV com neutralização de fórmulas (Excel/Sheets executam =, +, -, @…).
const PERIGOSO = /^[=+\-@\t\r]/

export function celula(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s =
    v instanceof Date
      ? v.toISOString()
      : typeof v === 'string'
        ? v
        : typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint'
          ? String(v)
          : JSON.stringify(v)
  if (PERIGOSO.test(s)) s = `'${s}`
  return /[",\n\r;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function paraCsv(linhas: readonly Record<string, unknown>[]): string {
  const [primeira] = linhas
  if (!primeira) return ''
  const colunas = Object.keys(primeira)
  return [
    colunas.map(celula).join(','),
    ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(',')),
  ].join('\r\n')
}
