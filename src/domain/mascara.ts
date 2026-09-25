// RN-ACE-08 / RN-GER-04: chave Pix só com os 4 últimos caracteres fora das telas autorizadas.
export const mascararPix = (chave: string): string =>
  chave.length <= 4 ? '****' : `****${chave.slice(-4)}`
