import type { CodigoErro } from '@/domain/erros'

/** Retorno de toda Server Action (08 §4.1, 12 UI-13); compartilhado com os formulários. */
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
