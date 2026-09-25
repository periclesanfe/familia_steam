'use client'

import type { ReactNode } from 'react'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

/**
 * 07 §6.2 / 12 UI-13: atos irreversíveis passam por confirmação com as consequências e o artigo.
 * O botão de confirmar envia o formulário `formId` (toda mutação é um <form>).
 */
export function ConfirmarAcao({
  formId,
  rotulo,
  titulo,
  consequencias,
  artigo,
  desabilitado,
}: {
  formId: string
  rotulo: string
  titulo: string
  consequencias: ReactNode[]
  artigo?: string
  desabilitado?: boolean
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" disabled={desabilitado}>
          {rotulo}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              <ul className="ml-4 list-disc">
                {consequencias.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              {artigo && <span className="text-xs">{artigo}</span>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <BotaoEnviar form={formId}>{rotulo}</BotaoEnviar>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
