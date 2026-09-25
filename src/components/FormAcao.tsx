'use client'

import { type ReactNode } from 'react'

import { ResultadoAcao, useAcao } from '@/components/ResultadoAcao'
import type { EstadoAcao } from '@/lib/estado-acao'

/** Formulário de um botão (sair, confirmar, votar…): toda mutação é um <form> (12 UI-13). */
export function FormAcao<D>({
  acao,
  children,
  className,
  sucesso,
  id,
}: {
  acao: (anterior: EstadoAcao<D> | null, fd: FormData) => Promise<EstadoAcao<D>>
  children: ReactNode
  className?: string
  sucesso?: string
  id?: string
}) {
  const [estado, enviar] = useAcao(acao, sucesso)
  return (
    <form id={id} action={enviar} className={className}>
      {children}
      <ResultadoAcao estado={estado} />
    </form>
  )
}
