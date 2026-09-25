import { z } from 'zod'

import { centavosDeTexto } from '@/domain/dinheiro'
import { appIdDeTexto } from '@/domain/steam'
import { instanteDeCampoLocal } from '@/domain/tempo'
import { OrigemProduto, TipoProduto } from '@/generated/prisma/enums'

const appId = z.string().transform((v, ctx) => {
  const id = appIdDeTexto(v)
  if (!id) {
    ctx.addIssue({ code: 'custom', message: 'Cole o link da loja Steam ou o appId' })
    return z.NEVER
  }
  return id
})

const centavosOpcional = () =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined
      const c = centavosDeTexto(v)
      if (c === null || c <= 0) {
        ctx.addIssue({ code: 'custom', message: 'Valor inválido' })
        return z.NEVER
      }
      return c
    })

const valorObrigatorio = z.string().transform((v, ctx) => {
  const c = centavosDeTexto(v)
  if (c === null || c <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Informe um valor como 89,90' })
    return z.NEVER
  }
  return c
})

const arquivoObrigatorio = (mensagem: string) =>
  z.instanceof(File, { message: mensagem }).refine((f) => f.size > 0, mensagem)

const instante = z.string().transform((v, ctx) => {
  const t = instanteDeCampoLocal(v)
  if (!t) {
    ctx.addIssue({ code: 'custom', message: 'Informe data e hora' })
    return z.NEVER
  }
  return t
})

const arquivo = z
  .instanceof(File)
  .optional()
  .transform((f) => (f && f.size > 0 ? f : undefined))

/** RN-COM-03: aviso prévio. Declarações vêm como `declaracao.V5`, `declaracao.V6`… */
export const avisarSchema = z
  .object({
    rodadaId: z.uuid(),
    app: appId,
    nome: z.string().trim().min(1, 'Informe o nome').max(200),
    tipo: z.enum(TipoProduto),
    origem: z.enum(OrigemProduto),
    lojaExterna: z.string().trim().max(60).optional(),
    pacoteId: z.coerce.number().int().positive().optional(),
    incluidos: z.string().optional(),
    precoReferencia: centavosOpcional(),
    evidencia: arquivo,
  })
  .loose()
  .transform((d) => {
    const declaracoes: Record<string, string> = {}
    for (const [k, v] of Object.entries(d)) {
      if (k.startsWith('declaracao.') && typeof v === 'string' && v.trim())
        declaracoes[k.slice(11)] = v.trim()
    }
    const incluidos = (d.incluidos ?? '')
      .split(/[\s,;]+/)
      .map(appIdDeTexto)
      .filter((x): x is number => x !== null)
    return {
      rodadaId: d.rodadaId,
      appId: d.app,
      nome: d.nome,
      tipo: d.tipo,
      origem: d.origem,
      lojaExterna: d.lojaExterna,
      pacoteId: d.pacoteId,
      appIdsIncluidos: d.tipo === 'PACOTE' ? [...new Set([d.app, ...incluidos])] : [],
      precoReferenciaCentavos: d.precoReferencia,
      declaracoes,
      evidencia: d.evidencia,
    }
  })

export const posseSchema = z.object({ avisoId: z.uuid(), retirar: z.literal('on').optional() })

/** RN-COM-09: registro da compra com comprovante. */
export const compraSchema = z.object({
  rodadaId: z.uuid(),
  avisoId: z.uuid().optional(),
  app: appId,
  nome: z.string().trim().min(1).max(200),
  compradaEm: instante,
  valor: valorObrigatorio,
  arquivo: arquivoObrigatorio('Anexe o comprovante da compra'),
  contaSteamId64: z.string().regex(/^7656119\d{10}$/, 'SteamID64 da conta que recebeu o jogo'),
  preVenda: z.literal('on').optional(),
})

export const reembolsoSchema = z.object({
  aquisicaoId: z.uuid(),
  valor: valorObrigatorio,
  reembolsadaEm: instante,
  arquivo: arquivoObrigatorio('Anexe o comprovante do reembolso'),
})

export const rodadaSchema = z.object({ rodadaId: z.uuid() })
