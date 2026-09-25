'use client'

import { useActionState, useState } from 'react'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { errosDo, ResultadoAcao } from '@/components/ResultadoAcao'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { avisarAcao, registrarCompraAcao, registrarReembolsoAcao } from '@/features/compra/acoes'

const DECLARACOES = [
  ['V5', 'Não é jogo de conteúdo pornográfico (Anexo I, entrada 01)', true],
  ['V9', 'Não possuo este produto (obrigatória se a biblioteca é privada ou é DLC)', false],
  ['V6', 'É compartilhável em família (se a loja não confirmar)', false],
  ['V4', 'Apesar dos avisos de nudez, não é pornográfico', false],
  ['V7', 'Trilha sonora ou tipo atípico: é conteúdo de jogo', false],
  ['V8', 'A DLC é conteúdo jogável, não moeda/skin/itens', false],
  ['V2', 'Ciente de que o jogo base desta DLC está no Anexo I', false],
] as const

// RN-COM-03/04: aviso prévio. As declarações só são exigidas quando a validação pede;
// o servidor diz quais faltam.
export function FormAviso({ rodadaId }: { rodadaId: string }) {
  const [estado, enviar] = useActionState(avisarAcao, null)
  const [tipo, setTipo] = useState('JOGO')
  const [origem, setOrigem] = useState('LOJA_STEAM')
  const v = (c: string) => (estado && !estado.ok ? estado.valores[c] : undefined)
  return (
    <form action={enviar} className="flex flex-col gap-4">
      <ResultadoAcao estado={estado} sucesso="Jogo avisado: janela de veto aberta" />
      <input type="hidden" name="rodadaId" value={rodadaId} />
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        <Field data-invalid={!!errosDo(estado, 'app')}>
          <FieldLabel htmlFor="app">Link da loja Steam ou appId</FieldLabel>
          <Input id="app" name="app" required defaultValue={v('app')} />
          <FieldError errors={errosDo(estado, 'app')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="nome">Nome</FieldLabel>
          <Input id="nome" name="nome" required defaultValue={v('nome')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="tipo">Tipo</FieldLabel>
          <NativeSelect
            id="tipo"
            name="tipo"
            value={tipo}
            onChange={(e) => {
              setTipo(e.currentTarget.value)
            }}
          >
            <NativeSelectOption value="JOGO">Jogo</NativeSelectOption>
            <NativeSelectOption value="DLC">DLC</NativeSelectOption>
            <NativeSelectOption value="PACOTE">Pacote</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="origem">Onde vai comprar</FieldLabel>
          <NativeSelect
            id="origem"
            name="origem"
            value={origem}
            onChange={(e) => {
              setOrigem(e.currentTarget.value)
            }}
          >
            <NativeSelectOption value="LOJA_STEAM">Loja Steam</NativeSelectOption>
            <NativeSelectOption value="CHAVE_EXTERNA">Chave de outra loja</NativeSelectOption>
          </NativeSelect>
        </Field>
        {origem === 'CHAVE_EXTERNA' && (
          <Field>
            <FieldLabel htmlFor="lojaExterna">Loja</FieldLabel>
            <Input id="lojaExterna" name="lojaExterna" required maxLength={60} />
          </Field>
        )}
        {tipo === 'PACOTE' && (
          <Field>
            <FieldLabel htmlFor="incluidos">AppIds incluídos no pacote</FieldLabel>
            <Input
              id="incluidos"
              name="incluidos"
              placeholder="413150, 1091500"
              defaultValue={v('incluidos')}
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="precoReferencia">Preço de referência</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="precoReferencia"
              name="precoReferencia"
              inputMode="decimal"
              defaultValue={v('precoReferencia')}
            />
            <InputGroupAddon>R$</InputGroupAddon>
          </InputGroup>
        </Field>
      </FieldGroup>
      <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Declarações</legend>
        {DECLARACOES.map(([regra, texto, sempre]) => (
          <Field key={regra} orientation="horizontal">
            <Checkbox
              id={`declaracao.${regra}`}
              name={`declaracao.${regra}`}
              value={texto}
              required={sempre}
            />
            <FieldLabel htmlFor={`declaracao.${regra}`} className="font-normal">
              {texto} <span className="text-muted-foreground">({regra})</span>
            </FieldLabel>
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor="evidencia">Evidência (print da loja ou da biblioteca)</FieldLabel>
          <Input
            id="evidencia"
            name="evidencia"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
          />
          <FieldDescription>
            Exigida quando os dados da Steam não confirmam o compartilhamento ou a posse.
          </FieldDescription>
        </Field>
      </fieldset>
      <div>
        <BotaoEnviar>Avisar o jogo</BotaoEnviar>
      </div>
    </form>
  )
}

// RN-COM-09: registro da compra pelo contemplado.
export function FormCompra({
  rodadaId,
  avisoId,
  steamContemplado,
}: {
  rodadaId: string
  avisoId?: string | undefined
  steamContemplado: string | null
}) {
  const [estado, enviar] = useActionState(registrarCompraAcao, null)
  const v = (c: string) => (estado && !estado.ok ? estado.valores[c] : undefined)
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <ResultadoAcao estado={estado} sucesso="Compra registrada" />
      <input type="hidden" name="rodadaId" value={rodadaId} />
      {avisoId && <input type="hidden" name="avisoId" value={avisoId} />}
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        <Field data-invalid={!!errosDo(estado, 'app')}>
          <FieldLabel htmlFor="c-app">Link da loja ou appId</FieldLabel>
          <Input id="c-app" name="app" required defaultValue={v('app')} />
          <FieldError errors={errosDo(estado, 'app')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="c-nome">Nome</FieldLabel>
          <Input id="c-nome" name="nome" required defaultValue={v('nome')} />
        </Field>
        <Field data-invalid={!!errosDo(estado, 'compradaEm')}>
          <FieldLabel htmlFor="c-compradaEm">Data e hora da compra</FieldLabel>
          <Input
            id="c-compradaEm"
            name="compradaEm"
            type="datetime-local"
            required
            defaultValue={v('compradaEm')}
          />
          <FieldDescription>Horário de Brasília.</FieldDescription>
          <FieldError errors={errosDo(estado, 'compradaEm')} />
        </Field>
        <Field data-invalid={!!errosDo(estado, 'valor')}>
          <FieldLabel htmlFor="c-valor">Total debitado</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="c-valor"
              name="valor"
              inputMode="decimal"
              required
              defaultValue={v('valor')}
            />
            <InputGroupAddon>R$</InputGroupAddon>
          </InputGroup>
          <FieldDescription>Com IOF e taxas; saldo da Carteira Steam conta.</FieldDescription>
          <FieldError errors={errosDo(estado, 'valor')} />
        </Field>
        <Field data-invalid={!!errosDo(estado, 'contaSteamId64')}>
          <FieldLabel htmlFor="c-conta">Conta Steam que recebeu (SteamID64)</FieldLabel>
          <Input
            id="c-conta"
            name="contaSteamId64"
            required
            defaultValue={v('contaSteamId64') ?? steamContemplado ?? ''}
            className="font-mono"
          />
          <FieldError errors={errosDo(estado, 'contaSteamId64')} />
        </Field>
        <Field data-invalid={!!errosDo(estado, 'arquivo')}>
          <FieldLabel htmlFor="c-arquivo">Comprovante</FieldLabel>
          <Input
            id="c-arquivo"
            name="arquivo"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,application/pdf"
          />
          <FieldError errors={errosDo(estado, 'arquivo')} />
        </Field>
      </FieldGroup>
      <Field orientation="horizontal">
        <Checkbox id="c-preVenda" name="preVenda" />
        <FieldLabel htmlFor="c-preVenda" className="font-normal">
          Pré-venda
        </FieldLabel>
      </Field>
      <div>
        <BotaoEnviar>Registrar compra</BotaoEnviar>
      </div>
    </form>
  )
}

// RN-COM-12: reembolso registrado pelo contemplado.
export function FormReembolso({ aquisicaoId }: { aquisicaoId: string }) {
  const [estado, enviar] = useActionState(registrarReembolsoAcao, null)
  return (
    <form action={enviar} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <input type="hidden" name="aquisicaoId" value={aquisicaoId} />
      <Field>
        <FieldLabel htmlFor={`r-valor-${aquisicaoId}`}>Valor reembolsado</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={`r-valor-${aquisicaoId}`}
            name="valor"
            inputMode="decimal"
            required
          />
          <InputGroupAddon>R$</InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel htmlFor={`r-em-${aquisicaoId}`}>Data do reembolso</FieldLabel>
        <Input id={`r-em-${aquisicaoId}`} name="reembolsadaEm" type="datetime-local" required />
      </Field>
      <Field>
        <FieldLabel htmlFor={`r-arq-${aquisicaoId}`}>Comprovante</FieldLabel>
        <Input
          id={`r-arq-${aquisicaoId}`}
          name="arquivo"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,application/pdf"
        />
      </Field>
      <div className="sm:col-span-3">
        <BotaoEnviar variant="outline">Registrar reembolso</BotaoEnviar>
        <ResultadoAcao estado={estado} sucesso="Reembolso registrado" />
      </div>
    </form>
  )
}
