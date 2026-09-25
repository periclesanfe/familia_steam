// RN-REG-03..07: parâmetros, vigência e adesão (arts. 42, 45 e 46).
import { z } from 'zod'

import { inicioDoMesSeguinte } from './tempo'

/** RN-REG-06 / C-PARAM: todo número do Regulamento vem daqui, nunca de constante. */
export const parametrosSchema = z.strictObject({
  contribuicaoCentavos: z.int().positive(),
  diaSorteio: z.int().min(1).max(28),
  horaSorteio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  horasJanelaVeto: z.int().positive(),
  horasVotacao: z.int().positive(),
  diasPrazoCompra: z.int().positive(),
  diasProrrogacao: z.int().positive(),
  membrosPrevistos: z.int().min(2),
  capacidadeFamilia: z.int().min(1),
})
export type Parametros = z.infer<typeof parametrosSchema>

/** Valores da minuta 1.0 (D-03: sorteio às 12:00). */
export const PARAMETROS_1_0: Parametros = {
  contribuicaoCentavos: 2500,
  diaSorteio: 3,
  horaSorteio: '12:00',
  horasJanelaVeto: 48,
  horasVotacao: 48,
  diasPrazoCompra: 30,
  diasProrrogacao: 7,
  membrosPrevistos: 5,
  capacidadeFamilia: 6,
}

type VersaoComVigencia = { ordem: number; vigenteDesde: Date | null }

/** RN-REG-04: a de maior `ordem` com `vigenteDesde ≤ t` (1.10 > 1.9 porque `ordem` é numérica). */
export function versaoVigente<V extends VersaoComVigencia>(
  versoes: readonly V[],
  t: Date,
): V | null {
  let vigente: V | null = null
  for (const v of versoes) {
    if (v.vigenteDesde && v.vigenteDesde <= t && (!vigente || v.ordem > vigente.ordem)) vigente = v
  }
  return vigente
}

/** RN-REG-03 (D-20): 00:00 SP do dia 1º do mês seguinte ao encerramento da votação. */
export const vigenciaDeAlteracao = (encerradaEm: Date): Date => inicioDoMesSeguinte(encerradaEm)

/** RN-REG-03: `numero` exibido a partir da `ordem` (0 → "1.0", 10 → "1.10"). */
export const numeroDaVersao = (ordem: number): string => `1.${String(ordem)}`

const BASE_STEAM_ID = 76561197960265728n

/** RN-STM-03: código de amigo (accountId) a partir do SteamID64. */
export const codigoAmigo = (steamId64: string): string => String(BigInt(steamId64) - BASE_STEAM_ID)

/** 05 §4: vale para a versão e para a conta Steam atual da pessoa (RN-ACE-16). */
export const adesaoValida = (
  a: { sha256Versao: string; codigoAmigo: string },
  versao: { sha256: string },
  pessoa: { steamId64: string },
): boolean => a.sha256Versao === versao.sha256 && a.codigoAmigo === codigoAmigo(pessoa.steamId64)

/** Bloco de assinaturas (RN-REG-07): o texto literal aceito, com o número da versão. */
export const declaracaoDeAdesao = (numero: string): string =>
  `Declaro que li e concordo com todos os termos deste Regulamento, versão ${numero}, e me comprometo a pagar a contribuição mensal até o término do CICLO, inclusive após ser contemplado.`

/** Versão vigente em t ou, antes da vigência, a 1.0 (ordem 0). */
export const versaoAplicavelSync = <V extends VersaoComVigencia>(
  versoes: readonly V[],
  t: Date,
): V | null => versaoVigente(versoes, t) ?? versoes.find((v) => v.ordem === 0) ?? null

export type AnexoDoTexto = { titulo: string; markdown: string }

/**
 * Separa o corpo do Regulamento dos anexos finais (assinaturas, Anexo I, Anexo II), só para
 * exibição: o texto gravado e o seu sha256 não mudam (C-HASH).
 */
export function dividirRegulamento(texto: string): { corpo: string; anexos: AnexoDoTexto[] } {
  const inicio = texto.search(/^## ASSINATURAS/m)
  if (inicio < 0) return { corpo: texto, anexos: [] }
  const anexos = texto
    .slice(inicio)
    .split(/^(?=## )/m)
    .filter((p) => p.trim())
    .map((p) => {
      const [titulo = '', ...resto] = p.split('\n')
      return { titulo: titulo.replace(/^##\s*/, '').trim(), markdown: resto.join('\n').trim() }
    })
  return { corpo: texto.slice(0, inicio).trimEnd(), anexos }
}
