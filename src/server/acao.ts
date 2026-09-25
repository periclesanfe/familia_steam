import 'server-only'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import type { z } from 'zod'

import { type CodigoErro, ERROS, ErroDeNegocio } from '@/domain/erros'

import type { Contexto } from './auditoria'
import { obterSessao } from './auth/sessao'
import { log } from './log'
import { agora } from './relogio'

export type ContextoAcao = Contexto & { ator: { tipo: 'MEMBRO'; pessoaId: string } }

export type EstadoAcao<D = unknown> =
  | { ok: true; dados: D }
  | {
      ok: false
      codigo: CodigoErro | 'ERRO_INESPERADO'
      mensagem: string
      artigo?: string
      erros?: Record<string, string[]>
      valores: Record<string, string>
    }

/** Estado inicial do `useActionState`. */
export const ESTADO_INICIAL = null

const MARCA = Symbol.for('familia-steam.acao')

/** Teste de guarda (14 SEG-01, CA-169): toda exportação de acoes.ts passou por `acao()`. */
export const ehAcao = (f: unknown): boolean => typeof f === 'function' && MARCA in f

/** FormData → objeto: chave repetida vira array; texto vazio vira ausente (12 UI-13). */
export function lerFormulario(fd: FormData): Record<string, unknown> {
  const saida: Record<string, unknown> = {}
  for (const chave of new Set(fd.keys())) {
    const valores = fd.getAll(chave).filter((v) => v !== '')
    if (valores.length === 0) continue
    saida[chave] = valores.length === 1 ? valores[0] : valores
  }
  return saida
}

/** Valores de texto para o formulário não perder o que foi digitado (React 19 limpa os campos). */
const valoresDe = (fd: FormData): Record<string, string> =>
  Object.fromEntries(
    [...fd.entries()].filter((p): p is [string, string] => typeof p[1] === 'string'),
  )

const falha = (codigo: CodigoErro, fd: FormData, extra: Partial<EstadoAcao> = {}): EstadoAcao =>
  ({
    ok: false,
    codigo,
    mensagem: ERROS[codigo].mensagem,
    valores: valoresDe(fd),
    ...extra,
  }) as EstadoAcao

/**
 * Única forma de criar Server Action (08 §4.1): sessão → zod → handler → auditoria/erros →
 * revalidação. A autorização fina (dono do recurso) fica no serviço, sobre o estado do banco.
 */
export function acao<S extends z.ZodType, D>(
  schema: S,
  handler: (entrada: z.output<S>, ctx: ContextoAcao) => Promise<D>,
) {
  const executar = async (
    _anterior: EstadoAcao<D> | null,
    fd: FormData,
  ): Promise<EstadoAcao<D>> => {
    const sessao = await obterSessao()
    if (!sessao) return falha('NAO_AUTENTICADO', fd) as EstadoAcao<D>
    const lido = schema.safeParse(lerFormulario(fd))
    if (!lido.success) {
      const erros: Record<string, string[]> = {}
      for (const issue of lido.error.issues) {
        const campo = issue.path.join('.') || '_'
        ;(erros[campo] ??= []).push(issue.message)
      }
      return falha('ENTRADA_INVALIDA', fd, { erros }) as EstadoAcao<D>
    }
    try {
      const ctx: ContextoAcao = {
        ator: { tipo: 'MEMBRO', pessoaId: sessao.pessoaId },
        agora: agora(),
      }
      const dados = await handler(lido.data, ctx)
      revalidatePath('/', 'layout') // 13 DP-11: nada é cacheado no servidor; custo só da rota atual
      return { ok: true, dados }
    } catch (e) {
      unstable_rethrow(e) // redirect()/notFound() seguem o fluxo do Next
      if (e instanceof ErroDeNegocio) {
        if (e.codigo === 'SEM_PERMISSAO') {
          log.aviso('acesso.negado', { acao: handler.name || 'anonima', pessoaId: sessao.pessoaId })
        }
        return {
          ok: false,
          codigo: e.codigo,
          mensagem: e.message,
          ...(e.artigo ? { artigo: e.artigo } : {}),
          valores: valoresDe(fd),
        }
      }
      log.erro('acao.erro', {
        pessoaId: sessao.pessoaId,
        erro: e instanceof Error ? e.name : 'desconhecido',
      })
      return {
        ok: false,
        codigo: 'ERRO_INESPERADO',
        mensagem: 'Não foi possível concluir. Tente de novo.',
        valores: valoresDe(fd),
      }
    }
  }
  Object.defineProperty(executar, MARCA, { value: true })
  return executar
}
