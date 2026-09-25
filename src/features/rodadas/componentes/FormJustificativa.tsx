'use client'

import { useActionState } from 'react'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { errosDo, ResultadoAcao } from '@/components/ResultadoAcao'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { justificarAntecipadamenteAcao } from '@/features/rodadas/acoes'

// RN-FIN-03: justificativa antes do sorteio, copiada para a contribuição (+7 dias).
export function FormJustificativa({ rodadaId }: { rodadaId: string }) {
  const [estado, enviar] = useActionState(justificarAntecipadamenteAcao, null)
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <ResultadoAcao estado={estado} sucesso="Justificativa registrada" />
      <input type="hidden" name="rodadaId" value={rodadaId} />
      <Field data-invalid={!!errosDo(estado, 'texto')}>
        <FieldLabel htmlFor="texto">Justificativa antecipada</FieldLabel>
        <Textarea
          id="texto"
          name="texto"
          required
          minLength={10}
          maxLength={500}
          rows={2}
          defaultValue={estado && !estado.ok ? estado.valores.texto : undefined}
          aria-describedby="texto-dica texto-erro"
        />
        <FieldDescription id="texto-dica">
          Se for contemplado alguém, seu prazo de pagamento vai do fim do dia do sorteio para 7 dias
          depois (art. 11, p.u.).
        </FieldDescription>
        <FieldError id="texto-erro" errors={errosDo(estado, 'texto')} />
      </Field>
      <div>
        <BotaoEnviar variant="outline">Justificar</BotaoEnviar>
      </div>
    </form>
  )
}
