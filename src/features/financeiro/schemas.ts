import { z } from 'zod'

import { centavosDeTexto } from '@/domain/dinheiro'
import { instanteDeCampoLocal } from '@/domain/tempo'
import { MotivoContestacao } from '@/generated/prisma/enums'

const centavos = z.string().transform((v, ctx) => {
  const c = centavosDeTexto(v)
  if (c === null || c <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Informe um valor como 25,00' })
    return z.NEVER
  }
  return c
})

const instante = z.string().transform((v, ctx) => {
  const t = instanteDeCampoLocal(v)
  if (!t) {
    ctx.addIssue({ code: 'custom', message: 'Informe data e hora do Pix' })
    return z.NEVER
  }
  return t
})

/** RN-FIN-04: o pagador é derivado no servidor, nunca vem do formulário. */
export const registrarPagamentoSchema = z
  .object({
    obrigacaoId: z.uuid(),
    valor: centavos,
    pixEm: instante,
    anexoId: z.uuid().optional(),
    formaDiversa: z.literal('on').optional(),
    recebedorId: z.uuid().optional(),
  })
  .refine((d) => d.formaDiversa === 'on' || d.anexoId !== undefined, {
    path: ['anexoId'],
    message: 'Anexe o comprovante (obrigatório, salvo forma diversa)',
  })

export const pagamentoSchema = z.object({ pagamentoId: z.uuid() })

export const contestarSchema = z.object({
  pagamentoId: z.uuid(),
  motivo: z.enum(MotivoContestacao, 'Escolha o motivo'),
  detalhe: z.string().trim().max(300).optional(),
})

export const justificarObrigacaoSchema = z.object({
  obrigacaoId: z.uuid(),
  texto: z.string().trim().min(10, 'Explique em pelo menos 10 caracteres (art. 11, p.u.)').max(500),
})

export const enviarAnexoSchema = z.object({
  arquivo: z.instanceof(File, { message: 'Escolha um arquivo' }),
  tipo: z.enum([
    'COMPROVANTE_PIX',
    'COMPROVANTE_COMPRA',
    'COMPROVANTE_REEMBOLSO',
    'EVIDENCIA_SORTEIO',
  ]),
})

/**
 * "Paguei" da tela: envia o comprovante (se houver) e registra o pagamento. Arquivo vazio do
 * <input type="file"> conta como ausente.
 */
export const pagarSchema = z
  .object({
    obrigacaoId: z.uuid(),
    valor: centavos,
    pixEm: instante,
    arquivo: z
      .instanceof(File)
      .optional()
      .transform((f) => (f && f.size > 0 ? f : undefined)),
    formaDiversa: z.literal('on').optional(),
    recebedorId: z
      .union([z.uuid(), z.literal('')])
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
  })
  .refine((d) => d.formaDiversa === 'on' || d.arquivo !== undefined, {
    path: ['arquivo'],
    message: 'Anexe o comprovante (obrigatório, salvo forma diversa)',
  })
