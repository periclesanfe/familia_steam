'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { parametrosSchema } from '@/domain/regulamento'
import { acao } from '@/server/acao'

import { editarRascunho, proporAlteracao } from './servico'

const TEXTO = new Set(['horaSorteio'])

/** Campos `parametros.*` do formulário → objeto validado pelo parametrosSchema (RN-REG-06). */
const comParametros = <S extends z.ZodRawShape>(forma: S) =>
  z
    .object(forma)
    .loose()
    .transform((d, ctx) => {
      const bruto = Object.fromEntries(
        Object.entries(d)
          .filter(([k]) => k.startsWith('parametros.'))
          .map(([k, v]) => {
            const nome = k.slice('parametros.'.length)
            return [nome, TEXTO.has(nome) ? v : Number(v)]
          }),
      )
      const p = parametrosSchema.safeParse(bruto)
      if (!p.success) {
        for (const i of p.error.issues) {
          ctx.addIssue({
            code: 'custom',
            path: ['parametros', ...i.path.map(String)],
            message: i.message,
          })
        }
        return z.NEVER
      }
      return { ...d, parametros: p.data }
    })

const texto = z.string().min(100, 'O texto do Regulamento está curto demais').max(200_000)
const resumo = z.string().trim().min(10, 'Resuma a mudança em pelo menos 10 caracteres').max(300)

// RN-REG-08: antes da vigência, qualquer membro edita o rascunho (as assinaturas recomeçam).
export const editarRascunhoAcao = acao(
  comParametros({ texto, resumo }),
  async (e, ctx): Promise<void> => {
    await editarRascunho(ctx, { texto: e.texto, resumo: e.resumo, parametros: e.parametros })
  },
  { perfis: ['PENDENTE', 'MEMBRO'] },
)

// RN-REG-03 (art. 42): depois da vigência, a alteração vai a votação.
export const proporAlteracaoAcao = acao(
  comParametros({
    texto,
    resumo,
    justificativa: z.string().trim().min(10, 'Justifique em pelo menos 10 caracteres').max(2000),
  }),
  async (e, ctx): Promise<void> => {
    const { votacaoId } = await proporAlteracao(ctx, {
      texto: e.texto,
      resumo: e.resumo,
      justificativa: e.justificativa,
      parametros: e.parametros,
    })
    redirect(`/votacoes/${votacaoId}`)
  },
)
