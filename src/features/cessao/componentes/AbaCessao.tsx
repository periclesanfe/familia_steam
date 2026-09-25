import Link from 'next/link'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { FormAcao } from '@/components/FormAcao'
import { StatusBadge } from '@/components/StatusBadge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { proporCessaoAcao, responderCessaoAcao, retirarCessaoAcao } from '@/features/cessao/acoes'
import type { cessaoDaRodada } from '@/features/cessao/consultas'
import { formatarDataHora } from '@/lib/formato'
import { STATUS_CESSAO } from '@/lib/rotulos'

type Dados = NonNullable<Awaited<ReturnType<typeof cessaoDaRodada>>>

// 07 §3.4: aba Cessão (art. 13). Propor, aceitar/recusar, retirar e o histórico.
export function AbaCessao({ rodadaId, d }: { rodadaId: string; d: Dados }) {
  return (
    <section aria-labelledby="cessao" className="flex flex-col gap-4">
      <h2 id="cessao" className="sr-only">
        Cessão
      </h2>
      {d.souContemplado && (
        <Card>
          <CardHeader>
            <CardTitle>Ceder a vez</CardTitle>
            <CardDescription>
              O beneficiário precisa aceitar; depois, todos votam (art. 13). Aprovada, os Pix que
              você recebeu viram repasse ao beneficiário, e você volta a concorrer na rodada
              seguinte.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {d.bloqueio ? (
              <p className="text-sm text-muted-foreground">{d.bloqueio}</p>
            ) : d.beneficiarios.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ninguém pode receber a vez: todos já foram contemplados ou estão impossibilitados.
              </p>
            ) : (
              <FormAcao
                acao={proporCessaoAcao}
                sucesso="Proposta enviada ao beneficiário"
                className="flex flex-col gap-3"
              >
                <input type="hidden" name="rodadaId" value={rodadaId} />
                <Field>
                  <FieldLabel htmlFor="beneficiarioId">Beneficiário</FieldLabel>
                  <NativeSelect id="beneficiarioId" name="beneficiarioId" required defaultValue="">
                    <NativeSelectOption value="" disabled>
                      Escolha
                    </NativeSelectOption>
                    {d.beneficiarios.map((b) => (
                      <NativeSelectOption key={b.id} value={b.id}>
                        {b.nome}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                {d.exigeCiencia && (
                  <Field orientation="horizontal">
                    <Checkbox id="cienciaPrazo" name="cienciaPrazo" required />
                    <FieldLabel htmlFor="cienciaPrazo" className="font-normal">
                      Estou ciente de que o prazo de compra (art. 20) não será prorrogado
                    </FieldLabel>
                  </Field>
                )}
                <div>
                  <BotaoEnviar>Propor cessão</BotaoEnviar>
                </div>
              </FormAcao>
            )}
          </CardContent>
        </Card>
      )}

      {d.cessoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma cessão proposta nesta rodada.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {d.cessoes.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{c.cedente}</span> cede a{' '}
                  <span className="font-medium">{c.beneficiario}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · proposta em {formatarDataHora(c.propostaEm)}
                  </span>
                </span>
                <StatusBadge {...STATUS_CESSAO[c.status]} />
              </div>
              <div className="flex flex-wrap gap-2">
                {c.votacaoId && (
                  <Link
                    href={`/votacoes/${c.votacaoId}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Ver votação
                  </Link>
                )}
                {c.souBeneficiario && c.status === 'AGUARDANDO_ACEITE' && (
                  <>
                    <FormAcao acao={responderCessaoAcao} sucesso="Aceita: a votação foi aberta">
                      <input type="hidden" name="cessaoId" value={c.id} />
                      <input type="hidden" name="resposta" value="aceitar" />
                      <BotaoEnviar size="sm">Aceitar</BotaoEnviar>
                    </FormAcao>
                    <FormAcao acao={responderCessaoAcao} sucesso="Proposta recusada">
                      <input type="hidden" name="cessaoId" value={c.id} />
                      <input type="hidden" name="resposta" value="recusar" />
                      <BotaoEnviar size="sm" variant="outline">
                        Recusar
                      </BotaoEnviar>
                    </FormAcao>
                  </>
                )}
                {c.souCedente &&
                  (c.status === 'AGUARDANDO_ACEITE' || c.status === 'EM_VOTACAO') && (
                    <FormAcao acao={retirarCessaoAcao} sucesso="Proposta retirada">
                      <input type="hidden" name="cessaoId" value={c.id} />
                      <BotaoEnviar size="sm" variant="outline">
                        Retirar proposta
                      </BotaoEnviar>
                    </FormAcao>
                  )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
