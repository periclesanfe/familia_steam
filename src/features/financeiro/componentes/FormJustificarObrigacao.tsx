'use client'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { errosDo, ResultadoAcao, useAcao } from '@/components/ResultadoAcao'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { justificarObrigacaoAcao } from '@/features/financeiro/acoes'

// RN-FIN-03: justificativa do devedor antes do vencimento (+7 dias, sem aprovação).
export function FormJustificarObrigacao({ obrigacaoId }: { obrigacaoId: string }) {
  const [estado, enviar] = useAcao(justificarObrigacaoAcao, 'Justificativa registrada')
  return (
    <form action={enviar} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="obrigacaoId" value={obrigacaoId} />
      <Field className="flex-1" data-invalid={!!errosDo(estado, 'texto')}>
        <FieldLabel htmlFor={`just-${obrigacaoId}`}>Justificar (ganha 7 dias)</FieldLabel>
        <Input
          id={`just-${obrigacaoId}`}
          aria-describedby={`just-${obrigacaoId}-erro`}
          name="texto"
          required
          minLength={10}
          maxLength={500}
          defaultValue={estado && !estado.ok ? estado.valores.texto : undefined}
        />
        <FieldError id={`just-${obrigacaoId}-erro`} errors={errosDo(estado, 'texto')} />
      </Field>
      <BotaoEnviar variant="outline">Justificar</BotaoEnviar>
      <ResultadoAcao estado={estado} />
    </form>
  )
}
