'use client'

import { useActionState } from 'react'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { errosDo, ResultadoAcao } from '@/components/ResultadoAcao'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { salvarDadosAcao } from '@/features/onboarding/acoes'

const TIPOS = [
  ['ALEATORIA', 'Chave aleatória (recomendada)'],
  ['EMAIL', 'E-mail'],
  ['TELEFONE', 'Telefone'],
  ['CPF', 'CPF'],
  ['CNPJ', 'CNPJ'],
] as const

type Valores = {
  nome: string | null
  apelido: string
  chavePix: string | null
  tipoChavePix: string | null
  maioridadeDeclarada: boolean
}

// RN-ACE-06 passos 1–3 e RN-CAD-05 (também usado em /perfil).
export function FormDados({ valores }: { valores: Valores }) {
  const [estado, enviar] = useActionState(salvarDadosAcao, null)
  const v = (campo: keyof Valores) =>
    estado && !estado.ok ? estado.valores[campo] : ((valores[campo] as string | null) ?? undefined)

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <ResultadoAcao estado={estado} sucesso="Dados salvos" />
      <FieldGroup>
        <Field data-invalid={!!errosDo(estado, 'nome')}>
          <FieldLabel htmlFor="nome">Nome completo</FieldLabel>
          <Input
            id="nome"
            name="nome"
            required
            minLength={3}
            maxLength={120}
            defaultValue={v('nome')}
            autoComplete="name"
            aria-invalid={!!errosDo(estado, 'nome')}
            aria-describedby="nome-erro"
          />
          <FieldError id="nome-erro" errors={errosDo(estado, 'nome')} />
        </Field>
        <Field data-invalid={!!errosDo(estado, 'apelido')}>
          <FieldLabel htmlFor="apelido">Apelido</FieldLabel>
          <Input
            id="apelido"
            name="apelido"
            required
            maxLength={40}
            defaultValue={v('apelido')}
            aria-invalid={!!errosDo(estado, 'apelido')}
            aria-describedby="apelido-erro"
          />
          <FieldDescription>Como você aparece para o grupo.</FieldDescription>
          <FieldError id="apelido-erro" errors={errosDo(estado, 'apelido')} />
        </Field>
        <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
          <Field data-invalid={!!errosDo(estado, 'tipoChavePix')}>
            <FieldLabel htmlFor="tipoChavePix">Tipo da chave Pix</FieldLabel>
            <NativeSelect
              id="tipoChavePix"
              name="tipoChavePix"
              required
              defaultValue={v('tipoChavePix') ?? 'ALEATORIA'}
            >
              {TIPOS.map(([valor, rotulo]) => (
                <NativeSelectOption key={valor} value={valor}>
                  {rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field data-invalid={!!errosDo(estado, 'chavePix')}>
            <FieldLabel htmlFor="chavePix">Chave Pix</FieldLabel>
            <Input
              id="chavePix"
              name="chavePix"
              required
              maxLength={140}
              defaultValue={v('chavePix')}
              autoComplete="off"
              aria-invalid={!!errosDo(estado, 'chavePix')}
              aria-describedby="chavePix-erro chavePix-dica"
            />
            <FieldDescription id="chavePix-dica">
              Os membros veem a chave para pagar você. Prefira a aleatória: não expõe CPF nem
              telefone.
            </FieldDescription>
            <FieldError id="chavePix-erro" errors={errosDo(estado, 'chavePix')} />
          </Field>
        </div>
        {valores.maioridadeDeclarada ? (
          <input type="hidden" name="maioridade" value="on" />
        ) : (
          <Field orientation="horizontal" data-invalid={!!errosDo(estado, 'maioridade')}>
            <Checkbox
              id="maioridade"
              name="maioridade"
              required
              aria-describedby="maioridade-erro"
            />
            <FieldLabel htmlFor="maioridade" className="font-normal">
              Declaro que sou maior de idade (art. 2º, II).
            </FieldLabel>
            <FieldError id="maioridade-erro" errors={errosDo(estado, 'maioridade')} />
          </Field>
        )}
      </FieldGroup>
      <div>
        <BotaoEnviar>Salvar dados</BotaoEnviar>
      </div>
    </form>
  )
}
