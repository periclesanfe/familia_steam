'use client'

import { useState } from 'react'

import { ConfirmarAcao } from '@/components/ConfirmarAcao'
import { errosDo, ResultadoAcao, useAcao } from '@/components/ResultadoAcao'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { formatarBRL } from '@/domain/dinheiro'
import type { Parametros } from '@/domain/regulamento'
import { convocarAcao } from '@/features/votacoes/acoes'
import { formatarDataCivil } from '@/lib/formato'

type Opcoes = {
  efeitos: readonly string[]
  bloqueados: { numero: number; nome: string }[]
  pagamentos: {
    id: string
    valorCentavos: number
    status: string
    obrigacao: { devedor: { apelido: string }; credor: { apelido: string } }
  }[]
  obrigacoes: {
    id: string
    tipo: string
    valorCentavos: number
    devedor: { apelido: string }
    credor: { apelido: string }
  }[]
  pessoas: { id: string; apelido: string }[]
  integrantes: { id: string; pessoaId: string; apelido: string }[]
  ciclos: { id: string; numero: number }[]
  rodadas: { id: string; sequencia: number; mesReferencia: string; ciclo: { numero: number } }[]
  regulamento: {
    numero: string
    texto: string
    parametros: Parametros
    vigencia: readonly [string, string]
  } | null
}

const ASSUNTOS = [
  ['CASO_OMISSO', 'Caso omisso (art. 43)'],
  ['CONTROVERSIA', 'Controvérsia (art. 47)'],
  ['EXCLUSAO_BLOQUEIO', 'Exclusão de entrada do Anexo I (art. 23, §6º)'],
  ['ALTERACAO_REGULAMENTO', 'Alteração do Regulamento (art. 42)'],
  ['ADMISSAO_MEMBRO', 'Admissão de membro (art. 6º)'],
  ['CONVITE_INTEGRANTE', 'Convite de integrante da família (art. 7º)'],
  ['REMOCAO_INTEGRANTE', 'Remoção de integrante da família (arts. 7º e 35)'],
  ['CONTINUIDADE_CONSORCIO', 'Continuidade do consórcio (art. 38)'],
  ['OUTRO', 'Outro: só registro (art. 41)'],
] as const

const EFEITOS: Record<string, string> = {
  NENHUM: 'Nenhum (só registrar a decisão)',
  VALIDAR_PAGAMENTO: 'Validar pagamento contestado',
  INVALIDAR_PAGAMENTO: 'Invalidar pagamento contestado',
  CANCELAR_OBRIGACAO: 'Cancelar obrigação',
  CRIAR_DEVOLUCAO: 'Criar devolução',
  SUSPENDER_CONTRIBUICOES: 'Suspender contribuições de alguém no ciclo',
  ADIAR_CICLO: 'Adiar o início de um ciclo planejado',
  ANULAR_RODADA: 'Anular uma rodada (novo sorteio no dia seguinte)',
}

const ROTULO_PARAMETRO: Record<keyof Parametros, string> = {
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

function Selecao({
  nome,
  rotulo,
  itens,
}: {
  nome: string
  rotulo: string
  itens: [string, string][]
}) {
  return (
    <Field>
      <FieldLabel htmlFor={nome}>{rotulo}</FieldLabel>
      <NativeSelect id={nome} name={nome} required>
        {itens.map(([v, r]) => (
          <NativeSelectOption key={v} value={v}>
            {r}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

// 07 §3.7 / 12 UI-13: o assunto (e, no caso omisso, o efeito) decide os campos; o servidor
// valida com a união discriminada (efeitoSchema).
export function FormNovaVotacao({
  opcoes,
  assuntoInicial,
}: {
  opcoes: Opcoes
  assuntoInicial?: string
}) {
  const [estado, enviar] = useAcao(convocarAcao)
  const [assunto, setAssunto] = useState(assuntoInicial ?? 'CASO_OMISSO')
  const [efeito, setEfeito] = useState('NENHUM')
  const pessoas = opcoes.pessoas.map((p): [string, string] => [p.id, p.apelido])
  const erroEfeito =
    estado && !estado.ok
      ? Object.entries(estado.erros ?? {}).filter(([k]) => k.startsWith('efeito'))
      : []

  return (
    <form id="form-convocar" action={enviar} className="flex flex-col gap-4">
      <ResultadoAcao estado={estado} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="assunto">Assunto</FieldLabel>
          <NativeSelect
            id="assunto"
            name="assunto"
            value={assunto}
            onChange={(e) => {
              setAssunto(e.currentTarget.value)
            }}
          >
            {ASSUNTOS.map(([v, r]) => (
              <NativeSelectOption key={v} value={v}>
                {r}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>
            Veto de jogo e cessão têm fluxos próprios (aviso do jogo e aba Cessão).
          </FieldDescription>
        </Field>

        {(assunto === 'CASO_OMISSO' || assunto === 'CONTROVERSIA') && (
          <Field>
            <FieldLabel htmlFor="efeito.tipo">Efeito ao aprovar</FieldLabel>
            <NativeSelect
              id="efeito.tipo"
              name="efeito.tipo"
              value={efeito}
              onChange={(e) => {
                setEfeito(e.currentTarget.value)
              }}
            >
              {opcoes.efeitos
                .filter((t) => t in EFEITOS)
                .map((t) => (
                  <NativeSelectOption key={t} value={t}>
                    {EFEITOS[t]}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
        )}

        {(assunto === 'CASO_OMISSO' || assunto === 'CONTROVERSIA') &&
          (efeito === 'VALIDAR_PAGAMENTO' || efeito === 'INVALIDAR_PAGAMENTO') && (
            <Selecao
              nome="efeito.pagamentoId"
              rotulo="Pagamento"
              itens={opcoes.pagamentos.map((p) => [
                p.id,
                `${p.obrigacao.devedor.apelido} → ${p.obrigacao.credor.apelido}: ${formatarBRL(p.valorCentavos)} (${p.status.toLowerCase()})`,
              ])}
            />
          )}
        {(assunto === 'CASO_OMISSO' || assunto === 'CONTROVERSIA') &&
          efeito === 'CANCELAR_OBRIGACAO' && (
            <Selecao
              nome="efeito.obrigacaoId"
              rotulo="Obrigação"
              itens={opcoes.obrigacoes.map((o) => [
                o.id,
                `${o.devedor.apelido} → ${o.credor.apelido}: ${formatarBRL(o.valorCentavos)} (${o.tipo.toLowerCase()})`,
              ])}
            />
          )}
        {(assunto === 'CASO_OMISSO' || assunto === 'CONTROVERSIA') &&
          efeito === 'CRIAR_DEVOLUCAO' && (
            <>
              <Selecao nome="efeito.devedorId" rotulo="Quem devolve" itens={pessoas} />
              <Selecao nome="efeito.credorId" rotulo="Quem recebe" itens={pessoas} />
              <Field>
                <FieldLabel htmlFor="efeito.valorCentavos">Valor (R$)</FieldLabel>
                <Input
                  id="efeito.valorCentavos"
                  name="efeito.valorCentavos"
                  inputMode="decimal"
                  required
                />
              </Field>
              <Selecao
                nome="efeito.rodadaId"
                rotulo="Rodada de referência"
                itens={opcoes.rodadas.map((r) => [
                  r.id,
                  `Ciclo ${String(r.ciclo.numero)}, rodada ${String(r.sequencia)} (${r.mesReferencia})`,
                ])}
              />
            </>
          )}
        {(assunto === 'CASO_OMISSO' || assunto === 'CONTROVERSIA') &&
          efeito === 'SUSPENDER_CONTRIBUICOES' && (
            <>
              <Selecao nome="efeito.pessoaId" rotulo="Pessoa" itens={pessoas} />
              <Selecao
                nome="efeito.cicloId"
                rotulo="Ciclo"
                itens={opcoes.ciclos.map((c) => [c.id, `Ciclo ${String(c.numero)}`])}
              />
            </>
          )}

        {(assunto === 'CASO_OMISSO' || assunto === 'CONTROVERSIA') &&
          efeito === 'ANULAR_RODADA' && (
            <Selecao
              nome="efeito.rodadaId"
              rotulo="Rodada a anular"
              itens={opcoes.rodadas.map((r) => [
                r.id,
                `Ciclo ${String(r.ciclo.numero)}, rodada ${String(r.sequencia)} (${r.mesReferencia})`,
              ])}
            />
          )}
        {(assunto === 'CASO_OMISSO' || assunto === 'CONTROVERSIA') && efeito === 'ADIAR_CICLO' && (
          <>
            <Selecao
              nome="efeito.cicloId"
              rotulo="Ciclo"
              itens={opcoes.ciclos.map((c) => [c.id, `Ciclo ${String(c.numero)}`])}
            />
            <Field>
              <FieldLabel htmlFor="efeito.novaDataInicio">Nova data de início</FieldLabel>
              <Input id="efeito.novaDataInicio" name="efeito.novaDataInicio" type="date" required />
              <FieldDescription>Sempre um dia 3 (RN-CIC-11).</FieldDescription>
            </Field>
          </>
        )}

        {assunto === 'ADMISSAO_MEMBRO' && (
          <>
            <Field>
              <FieldLabel htmlFor="efeito.nome">Nome completo</FieldLabel>
              <Input id="efeito.nome" name="efeito.nome" required minLength={3} />
            </Field>
            <Field>
              <FieldLabel htmlFor="efeito.steamId64">SteamID64</FieldLabel>
              <Input
                id="efeito.steamId64"
                name="efeito.steamId64"
                required
                inputMode="numeric"
                pattern="7656119[0-9]{10}"
                className="font-mono"
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="efeito.incluirNaFamilia" name="efeito.incluirNaFamilia" />
              <FieldLabel htmlFor="efeito.incluirNaFamilia" className="font-normal">
                Ainda não é da família: esta ATA também autoriza o convite (art. 7º)
              </FieldLabel>
            </Field>
            <FieldDescription>
              Aprovada, a pessoa entra com a Steam, assina o Regulamento e participa a partir do
              próximo ciclo (RN-CAD-12).
            </FieldDescription>
          </>
        )}

        {assunto === 'CONVITE_INTEGRANTE' && (
          <>
            <Field>
              <FieldLabel htmlFor="efeito.apelido">Apelido</FieldLabel>
              <Input id="efeito.apelido" name="efeito.apelido" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="efeito.steamId64">SteamID64 (opcional)</FieldLabel>
              <Input
                id="efeito.steamId64"
                name="efeito.steamId64"
                inputMode="numeric"
                pattern="7656119[0-9]{10}"
                className="font-mono"
              />
            </Field>
          </>
        )}

        {assunto === 'REMOCAO_INTEGRANTE' && (
          <Selecao
            nome="efeito.integrante"
            rotulo="Integrante"
            itens={opcoes.integrantes.map((i) => [`${i.id}:${i.pessoaId}`, i.apelido])}
          />
        )}

        {assunto === 'CONTINUIDADE_CONSORCIO' && (
          <Selecao
            nome="efeito.acao"
            rotulo="O que acontece se aprovada"
            itens={[
              ['ENCERRAR_AO_FIM_DO_CICLO', 'Encerrar ao fim do ciclo em andamento'],
              [
                'ENCERRAR_IMEDIATAMENTE',
                'Encerrar agora (restituições decididas na ATA, por devoluções)',
              ],
            ]}
          />
        )}

        {assunto === 'EXCLUSAO_BLOQUEIO' && (
          <Selecao
            nome="efeito.numero"
            rotulo="Entrada do Anexo I"
            itens={opcoes.bloqueados.map((b) => [
              String(b.numero),
              `${String(b.numero).padStart(2, '0')} · ${b.nome}`,
            ])}
          />
        )}

        {assunto === 'ALTERACAO_REGULAMENTO' && opcoes.regulamento && (
          <>
            <Field>
              <FieldLabel htmlFor="efeito.texto">
                Texto integral proposto (a partir da versão {opcoes.regulamento.numero})
              </FieldLabel>
              <Textarea
                id="efeito.texto"
                name="efeito.texto"
                rows={14}
                required
                className="font-mono text-xs"
                defaultValue={opcoes.regulamento.texto}
              />
            </Field>
            <p className="text-sm text-warning">
              {opcoes.regulamento.vigencia[0] === opcoes.regulamento.vigencia[1]
                ? `Se aprovada, vale a partir de ${formatarDataCivil(opcoes.regulamento.vigencia[0])}.`
                : `Aprovada ainda este mês, vale a partir de ${formatarDataCivil(opcoes.regulamento.vigencia[0])}; se só no fim do prazo, a partir de ${formatarDataCivil(opcoes.regulamento.vigencia[1])}.`}{' '}
              O diff contra a versão vigente aparece na página da votação.
            </p>
            <Field>
              <FieldLabel htmlFor="efeito.resumo">Resumo das mudanças</FieldLabel>
              <Input id="efeito.resumo" name="efeito.resumo" required minLength={10} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(ROTULO_PARAMETRO) as (keyof Parametros)[]).map((k) => (
                <Field key={k}>
                  <FieldLabel htmlFor={`parametros.${k}`}>{ROTULO_PARAMETRO[k]}</FieldLabel>
                  <Input
                    id={`parametros.${k}`}
                    name={`parametros.${k}`}
                    required
                    defaultValue={String(opcoes.regulamento?.parametros[k] ?? '')}
                  />
                </Field>
              ))}
            </div>
            <FieldDescription>
              Aprovada até o último dia do mês, a nova versão vale a partir do dia 1º do mês
              seguinte (RN-REG-03).
            </FieldDescription>
          </>
        )}

        {erroEfeito.length > 0 && (
          <FieldError
            errors={erroEfeito.flatMap(([, msgs]) => msgs.map((message) => ({ message })))}
          />
        )}

        <Field data-invalid={!!errosDo(estado, 'proposicao')}>
          <FieldLabel htmlFor="proposicao">Proposição</FieldLabel>
          <Textarea
            id="proposicao"
            aria-describedby="proposicao-erro"
            name="proposicao"
            required
            minLength={10}
            rows={2}
            defaultValue={estado && !estado.ok ? estado.valores.proposicao : undefined}
          />
          <FieldDescription>
            Escreva como mudança: o que acontece se o voto a favor vencer.
          </FieldDescription>
          <FieldError id="proposicao-erro" errors={errosDo(estado, 'proposicao')} />
        </Field>
        <Field data-invalid={!!errosDo(estado, 'justificativa')}>
          <FieldLabel htmlFor="justificativa">Justificativa</FieldLabel>
          <Textarea
            id="justificativa"
            aria-describedby="justificativa-erro"
            name="justificativa"
            required
            minLength={10}
            rows={3}
            defaultValue={estado && !estado.ok ? estado.valores.justificativa : undefined}
          />
          <FieldError id="justificativa-erro" errors={errosDo(estado, 'justificativa')} />
        </Field>
      </FieldGroup>
      <div>
        <ConfirmarAcao
          formId="form-convocar"
          rotulo="Convocar votação"
          titulo="Convocar esta votação?"
          consequencias={[
            'Todos os membros ativos e impossibilitados passam a ser eleitores.',
            'A votação fica aberta pelo prazo do Regulamento ou até atingir o quórum.',
            'O resultado gera ATA numerada e, se aprovada, o efeito é aplicado na hora.',
          ]}
          artigo="Art. 41"
        />
      </div>
    </form>
  )
}
