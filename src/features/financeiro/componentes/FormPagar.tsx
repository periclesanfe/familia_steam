'use client'

import { useActionState, useState } from 'react'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { errosDo, ResultadoAcao } from '@/components/ResultadoAcao'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { formatarBRL } from '@/domain/dinheiro'
import { pagarAcao } from '@/features/financeiro/acoes'

const LIMITE = 5 * 1024 * 1024

// RN-FIN-04 / 12 UI-13: "Paguei" — valor, data e hora do Pix (horário de Brasília) e comprovante.
export function FormPagar({
  obrigacaoId,
  saldoCentavos,
}: {
  obrigacaoId: string
  saldoCentavos: number
}) {
  const [estado, enviar] = useActionState(pagarAcao, null)
  const [grande, setGrande] = useState(false)
  const v = (c: string) => (estado && !estado.ok ? estado.valores[c] : undefined)
  const id = (c: string) => `${c}-${obrigacaoId}`

  return (
    <form action={enviar} className="flex flex-col gap-3">
      <ResultadoAcao estado={estado} sucesso="Pagamento registrado" />
      {estado?.ok &&
        estado.dados.alertas.map((a) => (
          <p key={a} className="text-sm text-warning">
            {a}
          </p>
        ))}
      <input type="hidden" name="obrigacaoId" value={obrigacaoId} />
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        <Field data-invalid={!!errosDo(estado, 'valor')}>
          <FieldLabel htmlFor={id('valor')}>Valor</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={id('valor')}
              name="valor"
              inputMode="decimal"
              required
              defaultValue={v('valor') ?? formatarBRL(saldoCentavos).replace(/^R\$\s/, '')}
              aria-invalid={!!errosDo(estado, 'valor')}
            />
            <InputGroupAddon>R$</InputGroupAddon>
          </InputGroup>
          <FieldError errors={errosDo(estado, 'valor')} />
        </Field>
        <Field data-invalid={!!errosDo(estado, 'pixEm')}>
          <FieldLabel htmlFor={id('pixEm')}>Data e hora do Pix</FieldLabel>
          <Input
            id={id('pixEm')}
            name="pixEm"
            type="datetime-local"
            required
            defaultValue={v('pixEm')}
            aria-invalid={!!errosDo(estado, 'pixEm')}
          />
          <FieldDescription>Horário de Brasília, como no comprovante.</FieldDescription>
          <FieldError errors={errosDo(estado, 'pixEm')} />
        </Field>
      </FieldGroup>
      <Field data-invalid={grande || !!errosDo(estado, 'arquivo')}>
        <FieldLabel htmlFor={id('arquivo')}>Comprovante</FieldLabel>
        <Input
          id={id('arquivo')}
          name="arquivo"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => {
            setGrande((e.currentTarget.files?.[0]?.size ?? 0) > LIMITE)
          }}
        />
        <FieldDescription>JPEG, PNG, WebP ou PDF, até 5 MB.</FieldDescription>
        <FieldError
          errors={grande ? [{ message: 'O arquivo passa de 5 MB.' }] : errosDo(estado, 'arquivo')}
        />
      </Field>
      <Field orientation="horizontal">
        <Checkbox id={id('formaDiversa')} name="formaDiversa" />
        <FieldLabel htmlFor={id('formaDiversa')} className="font-normal">
          Paguei de outra forma (dinheiro, conta de terceiro): só conta depois de confirmado pelo
          recebedor.
        </FieldLabel>
      </Field>
      <div>
        <BotaoEnviar disabled={grande}>Registrar pagamento</BotaoEnviar>
      </div>
    </form>
  )
}
