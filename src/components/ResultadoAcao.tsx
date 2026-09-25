'use client'

import { useActionState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import type { EstadoAcao } from '@/lib/estado-acao'

type Acao<D> = (anterior: EstadoAcao<D> | null, fd: FormData) => Promise<EstadoAcao<D>>

/**
 * 12 UI-13: `useActionState` com o toast disparado quando a ação responde, e não depois da
 * renderização: o formulário que remove o próprio item some antes e o aviso se perdia.
 */
export function useAcao<D>(acao: Acao<D>, sucesso?: string) {
  return useActionState(async (anterior: EstadoAcao<D> | null, fd: FormData) => {
    // redirect() no servidor não devolve estado
    const r = (await acao(anterior, fd)) as EstadoAcao<D> | undefined
    if (r?.ok && sucesso) toast.success(sucesso)
    if (r && !r.ok && r.codigo === 'ERRO_INESPERADO') toast.error(r.mensagem)
    return r ?? null
  }, null)
}

/** 12 UI-13: erro de negócio em Alert no topo do formulário (o toast vem do `useAcao`). */
export function ResultadoAcao({ estado }: { estado: EstadoAcao | null }) {
  if (
    !estado ||
    estado.ok ||
    estado.codigo === 'ERRO_INESPERADO' ||
    estado.codigo === 'ENTRADA_INVALIDA'
  ) {
    return null
  }
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {estado.mensagem}
        {estado.artigo && <span className="text-muted-foreground"> ({estado.artigo})</span>}
      </AlertDescription>
    </Alert>
  )
}

/** Erros do campo no formato do FieldError. */
export const errosDo = (estado: EstadoAcao | null, campo: string) =>
  estado && !estado.ok ? estado.erros?.[campo]?.map((message) => ({ message })) : undefined
