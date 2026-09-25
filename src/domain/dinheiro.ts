// C-DINHEIRO (docs/spec/02 §0): valores sempre em centavos inteiros.
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatarBRL = (centavos: number): string => {
  if (!Number.isSafeInteger(centavos)) throw new RangeError('centavos deve ser inteiro')
  return brl.format(centavos / 100)
}

/**
 * Texto digitado → centavos (12 UI-07). Aceita "25", "25,5", "25,50", "1.234,56" e "R$ 10".
 * Devolve null se não for um valor monetário não negativo com no máximo 2 casas.
 */
export function centavosDeTexto(texto: string): number | null {
  const limpo = texto.replace(/R\$|\s/g, '')
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(limpo)
  if (!m?.[1]) return null
  const reais = Number(m[1].replaceAll('.', ''))
  const centavos = reais * 100 + Number((m[2] ?? '0').padEnd(2, '0'))
  return Number.isSafeInteger(centavos) ? centavos : null
}
