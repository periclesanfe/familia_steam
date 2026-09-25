'use client'

import type { ComponentProps } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

// 12 UI-13: durante o envio, desabilitado com spinner e o mesmo texto (sem pular o layout).
export function BotaoEnviar({ children, disabled, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && <Spinner data-icon="inline-start" className="motion-reduce:hidden" />}
      {children}
    </Button>
  )
}
