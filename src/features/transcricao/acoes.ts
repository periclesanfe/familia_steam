'use server'

import { z } from 'zod'

import { instanteDeCampoLocal } from '@/domain/tempo'
import { acao } from '@/server/acao'
import { salvarAnexo } from '@/server/anexos'
import { emTransacao } from '@/server/tx'

import { revogarTranscricao, transcrever } from './servico'

const transcreverSchema = z
  .object({
    pessoaId: z.uuid(),
    tipo: z.enum([
      'NAO_CONCORRER',
      'CONFIRMA_PROXIMO_CICLO',
      'RECUSA_PROXIMO_CICLO',
      'JUSTIFICATIVA_PRORROGACAO',
    ]),
    rodadaId: z.uuid().optional(),
    cicloId: z.uuid().optional(),
    obrigacaoId: z.uuid().optional(),
    texto: z.string().trim().max(500).optional(),
    efetivaEm: z.string().transform((v, c) => {
      const t = instanteDeCampoLocal(v)
      if (!t) {
        c.addIssue({ code: 'custom', message: 'Informe o horário da mensagem no GRUPO' })
        return z.NEVER
      }
      return t
    }),
    arquivo: z
      .instanceof(File, { message: 'Anexe o print da mensagem' })
      .refine((f) => f.size > 0, 'Anexe o print da mensagem'),
  })
  .transform((d, c) => {
    const ato =
      d.tipo === 'NAO_CONCORRER' && d.rodadaId
        ? { tipo: d.tipo, rodadaId: d.rodadaId }
        : (d.tipo === 'CONFIRMA_PROXIMO_CICLO' || d.tipo === 'RECUSA_PROXIMO_CICLO') && d.cicloId
          ? { tipo: d.tipo, cicloId: d.cicloId }
          : d.tipo === 'JUSTIFICATIVA_PRORROGACAO' &&
              d.obrigacaoId &&
              d.texto &&
              d.texto.length >= 10
            ? { tipo: d.tipo, obrigacaoId: d.obrigacaoId, texto: d.texto }
            : null
    if (!ato) {
      c.addIssue({ code: 'custom', path: ['tipo'], message: 'Complete os dados do ato' })
      return z.NEVER
    }
    return { pessoaId: d.pessoaId, efetivaEm: d.efetivaEm, arquivo: d.arquivo, ato }
  })

// RN-GER-05: transcrição com print obrigatório (EVIDENCIA_GRUPO).
export const transcreverAcao = acao(transcreverSchema, async (e, ctx) => {
  const anexo = await emTransacao((tx) => salvarAnexo(tx, ctx, 'EVIDENCIA_GRUPO', e.arquivo))
  await transcrever(
    ctx,
    { pessoaId: e.pessoaId, efetivaEm: e.efetivaEm, evidenciaAnexoId: anexo.id },
    e.ato,
  )
})

export const revogarTranscricaoAcao = acao(z.object({ declaracaoId: z.uuid() }), (e, ctx) =>
  revogarTranscricao(ctx, e),
)
