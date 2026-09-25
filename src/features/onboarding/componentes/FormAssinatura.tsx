'use client'

import { useActionState } from 'react'

import { ConfirmarAcao } from '@/components/ConfirmarAcao'
import { errosDo, ResultadoAcao } from '@/components/ResultadoAcao'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { assinarAcao } from '@/features/onboarding/acoes'

// RN-REG-07: aceite eletrônico com a declaração literal do bloco de assinaturas.
export function FormAssinatura({
  declaracao,
  numero,
  habilitado,
}: {
  declaracao: string
  numero: string
  habilitado: boolean
}) {
  const [estado, enviar] = useActionState(assinarAcao, null)
  return (
    <form id="form-assinatura" action={enviar} className="flex flex-col gap-4">
      <ResultadoAcao estado={estado} sucesso="Regulamento assinado" />
      <FieldGroup>
        <Field orientation="horizontal" data-invalid={!!errosDo(estado, 'declaracao')}>
          <Checkbox id="declaracao" name="declaracao" required disabled={!habilitado} />
          <FieldLabel htmlFor="declaracao" className="font-normal">
            {declaracao}
          </FieldLabel>
          <FieldError errors={errosDo(estado, 'declaracao')} />
        </Field>
        <Field orientation="horizontal" data-invalid={!!errosDo(estado, 'contaUnica')}>
          <Checkbox id="contaUnica" name="contaUnica" required disabled={!habilitado} />
          <FieldLabel htmlFor="contaUnica" className="font-normal">
            Declaro que não participo do consórcio com outra conta Steam.
          </FieldLabel>
          <FieldError errors={errosDo(estado, 'contaUnica')} />
        </Field>
      </FieldGroup>
      <div>
        <ConfirmarAcao
          formId="form-assinatura"
          rotulo="Assinar o Regulamento"
          titulo={`Assinar a versão ${numero}?`}
          desabilitado={!habilitado}
          consequencias={[
            'A assinatura é eletrônica, vinculada à sua conta Steam, e não pode ser desfeita.',
            'Você se compromete a pagar a contribuição mensal até o fim do ciclo, inclusive depois de contemplado.',
            'O Regulamento entra em vigor quando todos os fundadores assinarem.',
          ]}
          artigo="Arts. 5º, 46 e bloco de assinaturas"
        />
      </div>
    </form>
  )
}
