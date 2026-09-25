'use client'

import { type ReactNode, useActionState } from 'react'

import { ResultadoAcao } from '@/components/ResultadoAcao'
import type { EstadoAcao } from '@/lib/estado-acao'

type Acao = (anterior: EstadoAcao<never> | null, fd: FormData) => Promise<EstadoAcao<never>>

/** Formulário de um botão (sair, confirmar, votar…): toda mutação é um <form> (12 UI-13). */
export function FormAcao({
  acao,
  children,
  className,
  sucesso,
}: {
  acao: Acao
  children: ReactNode
  className?: string
  sucesso?: string
}) {
  const [estado, enviar] = useActionState(acao, null)
  return (
    <form action={enviar} className={className}>
      {children}
      <ResultadoAcao estado={estado} {...(sucesso ? { sucesso } : {})} />
    </form>
  )
}
