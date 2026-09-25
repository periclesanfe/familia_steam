'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

// 07 §6.2: copiar o texto pronto para o GRUPO.
export function CopiarTexto({
  texto,
  rotulo = 'Copiar para o GRUPO',
}: {
  texto: string
  rotulo?: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        navigator.clipboard.writeText(texto).then(
          () => toast.success('Texto copiado'),
          () => toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.'),
        )
      }}
    >
      <Copy data-icon="inline-start" />
      {rotulo}
    </Button>
  )
}
