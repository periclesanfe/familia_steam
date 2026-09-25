'use client'

import { useActionState, useState } from 'react'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { errosDo, ResultadoAcao } from '@/components/ResultadoAcao'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { transcreverAcao } from '@/features/transcricao/acoes'

type Opcao = [string, string]

// RN-GER-05 (07 §3.11): transcrever um ato que o membro praticou no GRUPO, com print.
export function FormTranscricao({
  pessoaId,
  rodadas,
  ciclo,
  obrigacoes,
}: {
  pessoaId: string
  rodadas: Opcao[]
  ciclo: Opcao | null
  obrigacoes: Opcao[]
}) {
  const [estado, enviar] = useActionState(transcreverAcao, null)
  const [tipo, setTipo] = useState('NAO_CONCORRER')
  const ehCiclo = tipo === 'CONFIRMA_PROXIMO_CICLO' || tipo === 'RECUSA_PROXIMO_CICLO'
  const itens = tipo === 'NAO_CONCORRER' ? rodadas : ehCiclo ? (ciclo ? [ciclo] : []) : obrigacoes
  const campo = tipo === 'NAO_CONCORRER' ? 'rodadaId' : ehCiclo ? 'cicloId' : 'obrigacaoId'
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <ResultadoAcao estado={estado} sucesso="Ato transcrito; o membro foi avisado" />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        <Field data-invalid={!!errosDo(estado, 'tipo')}>
          <FieldLabel htmlFor="t-tipo">Ato</FieldLabel>
          <NativeSelect
            id="t-tipo"
            aria-describedby="t-tipo-erro"
            name="tipo"
            value={tipo}
            onChange={(e) => {
              setTipo(e.currentTarget.value)
            }}
          >
            <NativeSelectOption value="NAO_CONCORRER">Não vou concorrer</NativeSelectOption>
            <NativeSelectOption value="CONFIRMA_PROXIMO_CICLO">
              Confirmo o próximo ciclo
            </NativeSelectOption>
            <NativeSelectOption value="RECUSA_PROXIMO_CICLO">
              Não vou participar do próximo ciclo
            </NativeSelectOption>
            <NativeSelectOption value="JUSTIFICATIVA_PRORROGACAO">
              Justificativa de atraso
            </NativeSelectOption>
          </NativeSelect>
          <FieldError id="t-tipo-erro" errors={errosDo(estado, 'tipo')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="t-alvo">
            {tipo === 'NAO_CONCORRER' ? 'Rodada' : ehCiclo ? 'Ciclo' : 'Obrigação'}
          </FieldLabel>
          <NativeSelect id="t-alvo" name={campo} required disabled={itens.length === 0}>
            {itens.map(([v, r]) => (
              <NativeSelectOption key={v} value={v}>
                {r}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {itens.length === 0 && (
            <FieldDescription>Nada disponível para este ato.</FieldDescription>
          )}
        </Field>
        <Field data-invalid={!!errosDo(estado, 'efetivaEm')}>
          <FieldLabel htmlFor="t-efetivaEm">Horário da mensagem no GRUPO</FieldLabel>
          <Input
            id="t-efetivaEm"
            aria-describedby="t-efetivaEm-erro"
            name="efetivaEm"
            type="datetime-local"
            required
          />
          <FieldError id="t-efetivaEm-erro" errors={errosDo(estado, 'efetivaEm')} />
        </Field>
        <Field data-invalid={!!errosDo(estado, 'arquivo')}>
          <FieldLabel htmlFor="t-arquivo">Print da mensagem</FieldLabel>
          <Input
            id="t-arquivo"
            aria-describedby="t-arquivo-erro"
            name="arquivo"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,application/pdf"
          />
          <FieldError id="t-arquivo-erro" errors={errosDo(estado, 'arquivo')} />
        </Field>
      </FieldGroup>
      {tipo === 'JUSTIFICATIVA_PRORROGACAO' && (
        <Field>
          <FieldLabel htmlFor="t-texto">Texto da justificativa</FieldLabel>
          <Textarea id="t-texto" name="texto" required minLength={10} maxLength={500} />
        </Field>
      )}
      <FieldDescription>
        Impossibilidade, saídas, votos, aceites, aviso e compra não se transcrevem: só o próprio
        membro registra (RN-GER-05).
      </FieldDescription>
      <div>
        <BotaoEnviar variant="outline">Transcrever</BotaoEnviar>
      </div>
    </form>
  )
}
