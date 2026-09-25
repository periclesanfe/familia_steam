import { z } from 'zod'

import { centavosDeTexto } from '@/domain/dinheiro'
import { efeitoSchema } from '@/domain/efeitos'
import { parametrosSchema } from '@/domain/regulamento'
import { AssuntoVotacao, OpcaoVoto } from '@/generated/prisma/enums'

const INTEIROS = new Set([
  'numero',
  'appId',
  ...Object.keys(parametrosSchema.shape).filter((k) => k !== 'horaSorteio'),
])

/**
 * Formulário → efeito tipado (07 §3.7). Campos `efeito.*` viram o objeto do efeito, com as
 * conversões de tipo; `parametros.*` viram os parâmetros da alteração do Regulamento.
 */
export function efeitoDoFormulario(
  assunto: AssuntoVotacao,
  campos: Record<string, unknown>,
): unknown {
  const e: Record<string, unknown> = {}
  const parametros: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(campos)) {
    if (k.startsWith('parametros.')) {
      const nome = k.slice('parametros.'.length)
      parametros[nome] = INTEIROS.has(nome) ? Number(v) : v
    } else if (k.startsWith('efeito.')) {
      const nome = k.slice('efeito.'.length)
      if (nome === 'valorCentavos') e[nome] = centavosDeTexto(String(v))
      else if (INTEIROS.has(nome)) e[nome] = Number(v)
      else if (nome === 'excluirEntradas') e[nome] = [v].flat().map(Number)
      else if (nome === 'incluirNaFamilia') e[nome] = v === 'on'
      else if (nome === 'integrante') {
        // REMOCAO_INTEGRANTE: "integranteId:pessoaId" num select só
        const [integranteId, pessoaId] = String(v).split(':')
        Object.assign(e, { integranteId, pessoaId })
      } else if (v === '')
        continue // campo opcional vazio (ex.: SteamID do convite)
      else e[nome] = v
    }
  }
  if (Object.keys(parametros).length > 0) e.parametros = parametros
  if (assunto === 'OUTRO') return { tipo: 'NENHUM' }
  if (assunto !== 'CASO_OMISSO' && assunto !== 'CONTROVERSIA') e.tipo = assunto
  return e
}

export const convocarSchema = z
  .object({
    assunto: z.enum(AssuntoVotacao, 'Escolha o assunto'),
    proposicao: z.string().trim().min(10, 'Descreva o que significa votar a favor').max(1000),
    justificativa: z.string().trim().min(10, 'Justifique em pelo menos 10 caracteres').max(2000),
  })
  .loose()
  .transform((d, ctx) => {
    const r = efeitoSchema.safeParse(efeitoDoFormulario(d.assunto, d))
    if (!r.success) {
      for (const issue of r.error.issues) {
        ctx.addIssue({
          code: 'custom',
          path: ['efeito', ...issue.path.map(String)],
          message: issue.message,
        })
      }
      return z.NEVER
    }
    return {
      assunto: d.assunto,
      proposicao: d.proposicao,
      justificativa: d.justificativa,
      efeito: r.data,
    }
  })

export const votarSchema = z.object({ votacaoId: z.uuid(), opcao: z.enum(OpcaoVoto) })
export const votacaoSchema = z.object({ votacaoId: z.uuid() })
