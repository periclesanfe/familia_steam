'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import type { EstadoAcao } from '@/lib/estado-acao'

/** 12 UI-13: erro de negócio em Alert no topo do formulário; sucesso em toast curto. */
export function ResultadoAcao({
  estado,
  sucesso,
}: {
  estado: EstadoAcao | null
  sucesso?: string
}) {
  useEffect(() => {
    if (estado?.ok && sucesso) toast.success(sucesso)
    if (estado && !estado.ok && estado.codigo === 'ERRO_INESPERADO') toast.error(estado.mensagem)
  }, [estado, sucesso])

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
