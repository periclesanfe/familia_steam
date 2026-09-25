import { ExternalLink, Trash2 } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { FormAcao } from '@/components/FormAcao'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatarBRL } from '@/domain/dinheiro'
import { adicionarEventoAcao, removerEventoAcao } from '@/features/promocoes/acoes'
import { calendarioDePromocoes } from '@/features/promocoes/consultas'
import { formatarDataCivil } from '@/lib/formato'
import { paginaExige, TODOS_OS_PERFIS } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Calendário de promoções' }

// A Valve publica as datas das grandes promoções na documentação do Steamworks.
const DATAS_DA_VALVE = 'https://partner.steamgames.com/doc/marketing/upcoming_events'

const periodo = (inicio: string, fim: string) =>
  `${formatarDataCivil(inicio)} a ${formatarDataCivil(fim)}`

// 15 §6: sorteios × promoções da Steam, e o que a família quer que está em promoção agora.
export default async function PromocoesPage() {
  const { pessoaId, perfil } = await paginaExige(TODOS_OS_PERFIS)
  const c = await calendarioDePromocoes(agora())
  const podeEditar = perfil === 'MEMBRO' || perfil === 'PENDENTE'

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo="Calendário de promoções"
        descricao="Quando o prazo de compra do sorteio cruza uma promoção da Steam, o prêmio rende mais."
        acoes={
          <Button asChild variant="outline">
            <a href={DATAS_DA_VALVE} target="_blank" rel="noreferrer">
              Datas anunciadas pela Valve <ExternalLink />
            </a>
          </Button>
        }
      />

      <section aria-labelledby="sorteios" className="flex flex-col gap-3">
        <h2 id="sorteios" className="text-lg font-semibold">
          Próximos sorteios
        </h2>
        {c.janelas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Os sorteios aparecem quando você estiver numa família.
          </p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {c.janelas.map((j) => (
              <li
                key={j.sorteio}
                className={`flex flex-col gap-2 rounded-lg border bg-card p-4 ${j.eventos.length > 0 ? 'border-success/60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="font-semibold">Sorteio {formatarDataCivil(j.sorteio)}</span>
                    <span className="text-xs text-muted-foreground">
                      Compra até {formatarDataCivil(j.fimCompra)}
                    </span>
                  </span>
                  {j.eventos.length > 0 && <StatusBadge rotulo="Bom momento" tom="sucesso" />}
                </div>
                {j.eventos.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    Nenhuma promoção cadastrada no prazo.
                  </span>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {j.eventos.map((e) => (
                      <li key={e.id}>
                        <span className="font-medium">{e.nome}</span>{' '}
                        <span className="text-muted-foreground">
                          {e.noDia ? '(já no dia do sorteio)' : periodo(e.inicio, e.fim)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="eventos" className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle id="eventos">Promoções da Steam</CardTitle>
            <CardDescription>
              Valem para todas as famílias. Cadastre com o link de onde veio a data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {c.eventos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma promoção futura cadastrada.</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {c.eventos.map((e) => {
                  const agoraRolando = e.inicio <= c.hoje
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="flex flex-col">
                        <span className="font-medium">
                          {e.nome}{' '}
                          {agoraRolando && <StatusBadge rotulo="Acontecendo" tom="sucesso" />}
                        </span>
                        <span className="text-muted-foreground">{periodo(e.inicio, e.fim)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Button asChild size="icon-sm" variant="ghost">
                          <a href={e.fonteUrl} target="_blank" rel="noreferrer">
                            <ExternalLink />
                            <span className="sr-only">Fonte de {e.nome}</span>
                          </a>
                        </Button>
                        {e.criadoPorId === pessoaId && (
                          <FormAcao acao={removerEventoAcao} sucesso="Evento removido">
                            <input type="hidden" name="eventoId" value={e.id} />
                            <Button type="submit" size="icon-sm" variant="ghost">
                              <Trash2 />
                              <span className="sr-only">Remover {e.nome}</span>
                            </Button>
                          </FormAcao>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        {podeEditar && (
          <Card>
            <CardHeader>
              <CardTitle>Cadastrar promoção</CardTitle>
            </CardHeader>
            <CardContent>
              <FormAcao
                acao={adicionarEventoAcao}
                sucesso="Promoção cadastrada"
                className="flex flex-col gap-3"
              >
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="nome">Nome</FieldLabel>
                    <Input id="nome" name="nome" required minLength={3} maxLength={80} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel htmlFor="inicio">Início</FieldLabel>
                      <Input id="inicio" name="inicio" type="date" required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="fim">Fim</FieldLabel>
                      <Input id="fim" name="fim" type="date" required />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="fonteUrl">Link da fonte</FieldLabel>
                    <Input
                      id="fonteUrl"
                      name="fonteUrl"
                      type="url"
                      required
                      pattern="https://.*"
                      placeholder="https://…"
                    />
                  </Field>
                </FieldGroup>
                <div>
                  <BotaoEnviar>Cadastrar</BotaoEnviar>
                </div>
              </FormAcao>
            </CardContent>
          </Card>
        )}
      </section>

      <section aria-labelledby="agora" className="flex flex-col gap-3">
        <h2 id="agora" className="text-lg font-semibold">
          Em promoção agora na família
        </h2>
        {c.emPromocao.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum item das listas de desejos da família está com desconto.
          </p>
        ) : (
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {c.emPromocao.map((a) => (
              <li key={a.appId}>
                <Link
                  href={`/jogos/${String(a.appId)}`}
                  className="flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-colors duration-150 hover:border-primary/50"
                >
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- CDN da Steam, sem otimizador (08 §8.2) */}
                    <img
                      src={a.imagemUrl}
                      alt=""
                      loading="lazy"
                      className="aspect-[460/215] w-full object-cover"
                    />
                    <span className="absolute top-2 right-2 rounded bg-success px-2 py-0.5 text-sm font-bold text-background tabular-nums">
                      -{a.descontoPct}%
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <span className="line-clamp-1 font-medium">
                      {a.nome ?? `App ${String(a.appId)}`}
                    </span>
                    {a.precoFinalCentavos !== null && (
                      <span className="text-sm tabular-nums">
                        {a.precoInicialCentavos !== null && (
                          <span className="mr-1 text-xs text-muted-foreground line-through">
                            {formatarBRL(a.precoInicialCentavos)}
                          </span>
                        )}
                        <span className="font-semibold text-success">
                          {formatarBRL(a.precoFinalCentavos)}
                        </span>
                      </span>
                    )}
                    <span className="mt-auto line-clamp-2 text-xs text-muted-foreground">
                      Na lista de {a.querem.join(', ')}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
