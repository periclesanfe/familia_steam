import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AbasNaUrl } from '@/components/AbasNaUrl'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { ConfirmarAcao } from '@/components/ConfirmarAcao'
import { CopiarTexto } from '@/components/CopiarTexto'
import { Dinheiro } from '@/components/Dinheiro'
import { FormAcao } from '@/components/FormAcao'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AbaCessao } from '@/features/cessao/componentes/AbaCessao'
import { cessaoDaRodada } from '@/features/cessao/consultas'
import { AbaJogo } from '@/features/compra/componentes/AbaJogo'
import { jogoDaRodada } from '@/features/compra/consultas'
import { ListaObrigacoes } from '@/features/financeiro/componentes/ListaObrigacoes'
import { pagamentosDaRodada } from '@/features/financeiro/consultas'
import { nomeDoMes, textoDoSorteio } from '@/features/grupo/textos'
import {
  naoConcorrerAcao,
  realizarSorteioAcao,
  voltarAConcorrerAcao,
} from '@/features/rodadas/acoes'
import { FormJustificativa } from '@/features/rodadas/componentes/FormJustificativa'
import { detalheRodada } from '@/features/rodadas/consultas'
import { formatarDataHora } from '@/lib/formato'
import {
  MOTIVO_SEM_CONTEMPLADO,
  MOTIVO_SORTEIO,
  STATUS_RODADA,
  TIPO_CONTEMPLACAO,
} from '@/lib/rotulos'
import { paginaExige } from '@/server/auth/guardas'
import { env } from '@/server/env'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Rodada' }

// 07 §3.4: detalhe da rodada com as abas Sorteio, Pagamentos, Jogo e Cessão.
export default async function RodadaPage({ params, searchParams }: PageProps<'/rodadas/[id]'>) {
  const { pessoaId } = await paginaExige(['MEMBRO'])
  const [{ id }, { aba: abaPedida }] = await Promise.all([params, searchParams])
  const t = agora()
  const d = await detalheRodada(id, pessoaId, t)
  if (!d) notFound()
  const temPagamentos = d.rodada.status === 'CONTEMPLADA' || d.rodada.status === 'FECHADA'
  const abas = [
    { id: 'sorteio', rotulo: 'Sorteio' },
    ...(temPagamentos
      ? [
          { id: 'pagamentos', rotulo: 'Pagamentos' },
          { id: 'jogo', rotulo: 'Jogo' },
          { id: 'cessao', rotulo: 'Cessão' },
        ]
      : []),
  ]
  const aba = abas.some((a) => a.id === abaPedida) ? (abaPedida as string) : 'sorteio'
  const [pagamentos, jogo, cessao] = await Promise.all([
    aba === 'pagamentos' ? pagamentosDaRodada(id, t) : null,
    aba === 'jogo' ? jogoDaRodada(id, pessoaId, t) : null,
    aba === 'cessao' ? cessaoDaRodada(id, pessoaId, t) : null,
  ])
  const { rodada: r, sorteio } = d
  const eu = d.participantes.find((p) => p.eu)
  const link = `${env().APP_URL}/rodadas/${r.id}`

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo={`Rodada ${String(r.sequencia)} · ${nomeDoMes(r.mesReferencia)}`}
        descricao={`Ciclo ${String(d.ciclo.numero)}${r.contemplado ? ` · contemplado: ${r.contemplado}` : ''}`}
        acoes={<StatusBadge {...STATUS_RODADA[r.status]} />}
      />
      <AbasNaUrl abas={abas} ativa={aba} base={`/rodadas/${r.id}`} />

      {cessao ? (
        <AbaCessao rodadaId={r.id} d={cessao} />
      ) : jogo ? (
        <AbaJogo d={jogo} agora={t} />
      ) : pagamentos ? (
        <section aria-labelledby="pagamentos" className="flex flex-col gap-4">
          <h2 id="pagamentos" className="sr-only">
            Pagamentos
          </h2>
          <p className="text-sm">
            PRÊMIO nominal <Dinheiro centavos={pagamentos.premioCentavos} className="font-medium" />{' '}
            · recebido até agora{' '}
            <Dinheiro centavos={pagamentos.recebidoCentavos} className="font-medium" /> (art. 5º,
            §2º)
          </p>
          <ListaObrigacoes obrigacoes={pagamentos.obrigacoes} eu={pessoaId} agora={t} />
        </section>
      ) : r.status === 'AGENDADA' ? (
        <Card>
          <CardHeader>
            <CardTitle>Sorteio em {formatarDataHora(r.agendadaPara)}</CardTitle>
            <CardDescription>
              Automático no horário (art. 8º). Se o sistema atrasar, qualquer membro pode realizá-lo
              a partir daí.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {d.podeSortear && (
              <FormAcao id="form-sortear" acao={realizarSorteioAcao} sucesso="Sorteio realizado">
                <input type="hidden" name="rodadaId" value={r.id} />
                <ConfirmarAcao
                  formId="form-sortear"
                  rotulo="Realizar sorteio"
                  titulo="Realizar o sorteio agora?"
                  consequencias={[
                    'O resultado é definitivo: não existe "refazer" (RN-SOR-14).',
                    'Declarações de não concorrer feitas até agora valem; depois, não.',
                  ]}
                  artigo="Arts. 8º, 9º e 12"
                />
              </FormAcao>
            )}
            {eu && !eu.motivos.includes('JA_CONTEMPLADO') && (
              <FormAcao acao={d.euDeclarei.naoConcorrer ? voltarAConcorrerAcao : naoConcorrerAcao}>
                <input type="hidden" name="rodadaId" value={r.id} />
                <Button type="submit" variant="outline">
                  {d.euDeclarei.naoConcorrer ? 'Voltar a concorrer' : 'Não vou concorrer'}
                </Button>
              </FormAcao>
            )}
          </CardContent>
          {eu && !d.euDeclarei.justificativa && (
            <CardContent>
              <FormJustificativa rodadaId={r.id} />
            </CardContent>
          )}
          {d.euDeclarei.justificativa && (
            <CardContent className="text-sm text-muted-foreground">
              Sua justificativa antecipada: “{d.euDeclarei.justificativa}”
            </CardContent>
          )}
        </Card>
      ) : sorteio ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {r.contemplado
                ? `${r.contemplado} foi contemplado (${r.tipoContemplacao ? TIPO_CONTEMPLACAO[r.tipoContemplacao] : ''})`
                : `Sem contemplado: ${r.motivoSemContemplado ? MOTIVO_SEM_CONTEMPLADO[r.motivoSemContemplado] : ''}`}
            </CardTitle>
            <CardDescription>
              Corte em {formatarDataHora(sorteio.corteEm)}, disparado por {sorteio.disparadoPor}
              {r.atrasada && ' · realizado com atraso: os prazos contam desta data (D-04)'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {sorteio.indice !== null && (
              <p>
                Índice sorteado: <span className="font-mono tabular-nums">{sorteio.indice}</span>{' '}
                entre os elegíveis em ordem de identificador.
              </p>
            )}
            <p className="text-muted-foreground">
              sha256 do registro <span className="font-mono break-all">{sorteio.hash}</span>
            </p>
            {r.prazoCompraAte && (
              <p>
                Compra do jogo até {formatarDataHora(new Date(r.prazoCompraAte.getTime() - 60_000))}
                .
              </p>
            )}
            <div>
              <CopiarTexto
                texto={textoDoSorteio({
                  mesReferencia: r.mesReferencia,
                  cicloNumero: d.ciclo.numero,
                  sequencia: r.sequencia,
                  corteEm: sorteio.corteEm,
                  concorreram: d.concorreram,
                  contemplado: r.contemplado,
                  motivoSemContemplado: r.motivoSemContemplado
                    ? MOTIVO_SEM_CONTEMPLADO[r.motivoSemContemplado]
                    : null,
                  hash: sorteio.hash,
                  contribuicaoCentavos: r.contribuicaoCentavos,
                  vencimentoEm: d.vencimentoEm,
                  link,
                })}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!pagamentos && !jogo && !cessao && d.participantes.length > 0 && (
        <section aria-labelledby="participantes" className="flex flex-col gap-3">
          <h2 id="participantes" className="text-lg font-semibold">
            {sorteio ? 'Participantes no corte' : 'Situação prevista'}
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {d.participantes.map((p) => (
              <li
                key={p.pessoaId}
                className="flex flex-col gap-1 px-4 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium">
                  {p.apelido}
                  {p.eu && <span className="text-muted-foreground"> (você)</span>}
                </span>
                <span className="text-muted-foreground">
                  {p.elegivel
                    ? 'Elegível'
                    : p.motivos.map((m) => MOTIVO_SORTEIO[m] ?? m).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
