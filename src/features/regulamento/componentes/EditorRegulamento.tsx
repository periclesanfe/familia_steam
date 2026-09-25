'use client'

import { useActionState, useDeferredValue, useMemo, useState } from 'react'

import { ConfirmarAcao } from '@/components/ConfirmarAcao'
import { ListaDiff } from '@/components/ListaDiff'
import { errosDo, ResultadoAcao } from '@/components/ResultadoAcao'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { diffLinhas, trechosDoDiff } from '@/domain/diff'
import type { Parametros } from '@/domain/regulamento'
import { editarRascunhoAcao, proporAlteracaoAcao } from '@/features/regulamento/acoes'

const ROTULO: Record<keyof Parametros, string> = {
  contribuicaoCentavos: 'Contribuição (centavos)',
  diaSorteio: 'Dia do sorteio',
  horaSorteio: 'Hora do sorteio',
  horasJanelaVeto: 'Janela de veto (horas)',
  horasVotacao: 'Duração da votação (horas)',
  diasPrazoCompra: 'Prazo de compra (dias)',
  diasProrrogacao: 'Prorrogação (dias)',
  membrosPrevistos: 'Membros previstos',
  capacidadeFamilia: 'Capacidade da família',
}

// RN-REG-08 (rascunho, antes da vigência) e RN-REG-03 (proposta por votação, depois).
export function EditorRegulamento({
  modo,
  numero,
  textoBase,
  parametrosBase,
  assinaturas,
}: {
  modo: 'rascunho' | 'proposta'
  numero: string
  textoBase: string
  parametrosBase: Parametros
  assinaturas: number
}) {
  const [estado, enviar] = useActionState(
    modo === 'rascunho' ? editarRascunhoAcao : proporAlteracaoAcao,
    null,
  )
  const [texto, setTexto] = useState(textoBase)
  const adiado = useDeferredValue(texto)
  const trechos = useMemo(() => trechosDoDiff(diffLinhas(textoBase, adiado)), [textoBase, adiado])
  const alteradas = trechos.filter((t) => t.tipo === 'incluida' || t.tipo === 'removida').length
  const v = (c: string) => (estado && !estado.ok ? estado.valores[c] : undefined)

  return (
    <form id="form-regulamento" action={enviar} className="flex flex-col gap-5">
      <ResultadoAcao
        estado={estado}
        sucesso={
          modo === 'rascunho'
            ? 'Rascunho salvo: todos precisam assinar o texto novo'
            : 'Alteração enviada para votação'
        }
      />
      <Field data-invalid={!!errosDo(estado, 'texto')}>
        <FieldLabel htmlFor="texto" className="sr-only">
          Texto do Regulamento (Markdown)
        </FieldLabel>
        <Textarea
          id="texto"
          name="texto"
          value={texto}
          onChange={(e) => {
            setTexto(e.currentTarget.value)
          }}
          rows={24}
          spellCheck
          className="font-mono text-xs leading-relaxed"
          aria-describedby="texto-erro texto-dica"
        />
        <FieldDescription id="texto-dica">
          Markdown: <code>## Título</code>, <code>**negrito**</code>, listas com <code>-</code>.
          Editando a partir da versão {numero}.
        </FieldDescription>
        <FieldError id="texto-erro" errors={errosDo(estado, 'texto')} />
      </Field>
      <details className="rounded-lg border">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
          Diferenças em relação à versão {numero} ({alteradas} linha{alteradas === 1 ? '' : 's'})
        </summary>
        <div className="p-2">
          <ListaDiff trechos={trechos} />
        </div>
      </details>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Parâmetros (RN-REG-06)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(ROTULO) as (keyof Parametros)[]).map((k) => (
            <Field key={k} data-invalid={!!errosDo(estado, `parametros.${k}`)}>
              <FieldLabel htmlFor={`parametros.${k}`}>{ROTULO[k]}</FieldLabel>
              <Input
                id={`parametros.${k}`}
                name={`parametros.${k}`}
                defaultValue={v(`parametros.${k}`) ?? String(parametrosBase[k])}
                inputMode={k === 'horaSorteio' ? 'text' : 'numeric'}
                required
                aria-describedby={`parametros.${k}-erro`}
              />
              <FieldError id={`parametros.${k}-erro`} errors={errosDo(estado, `parametros.${k}`)} />
            </Field>
          ))}
        </div>
      </fieldset>

      <Field data-invalid={!!errosDo(estado, 'resumo')}>
        <FieldLabel htmlFor="resumo">Resumo das mudanças</FieldLabel>
        <Input
          id="resumo"
          name="resumo"
          required
          minLength={10}
          maxLength={300}
          defaultValue={v('resumo')}
          placeholder="Ex.: prazo de compra de 30 para 20 dias; art. 12 com a regra do não concorrer"
          aria-describedby="resumo-erro"
        />
        <FieldError id="resumo-erro" errors={errosDo(estado, 'resumo')} />
      </Field>

      {modo === 'proposta' && (
        <Field data-invalid={!!errosDo(estado, 'justificativa')}>
          <FieldLabel htmlFor="justificativa">Por que mudar</FieldLabel>
          <Textarea
            id="justificativa"
            name="justificativa"
            required
            minLength={10}
            maxLength={2000}
            rows={3}
            defaultValue={v('justificativa')}
            aria-describedby="justificativa-erro"
          />
          <FieldError id="justificativa-erro" errors={errosDo(estado, 'justificativa')} />
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {modo === 'rascunho' ? (
          <ConfirmarAcao
            formId="form-regulamento"
            rotulo="Salvar o rascunho"
            titulo="Salvar a nova redação do Regulamento?"
            consequencias={[
              'O texto passa a valer como o rascunho da família, e todos veem o que mudou.',
              assinaturas > 0
                ? `${String(assinaturas)} assinatura(s) já feita(s) deixam de valer: todos assinam de novo o texto final.`
                : 'Ninguém assinou ainda.',
              'O acordo só entra em vigor quando todos assinarem o mesmo texto.',
            ]}
          />
        ) : (
          <ConfirmarAcao
            formId="form-regulamento"
            rotulo="Enviar para votação"
            titulo="Abrir a votação da alteração?"
            consequencias={[
              'Todos os membros votam; vale o quórum do Regulamento (art. 42).',
              'Aprovada, a nova versão entra em vigor no dia 1º do mês seguinte.',
              'Só pode haver uma alteração em votação por vez.',
            ]}
            artigo="Art. 42"
          />
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setTexto(textoBase)
          }}
          disabled={texto === textoBase}
        >
          Desfazer mudanças no texto
        </Button>
      </div>
    </form>
  )
}
