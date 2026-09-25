// C-DINHEIRO (docs/spec/02 §0): valores sempre em centavos inteiros.
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatarBRL = (centavos: number): string => {
  if (!Number.isSafeInteger(centavos)) throw new RangeError('centavos deve ser inteiro')
  return brl.format(centavos / 100)
}
