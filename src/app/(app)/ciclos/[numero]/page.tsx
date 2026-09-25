import { Check, Clock, Star, TriangleAlert } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Dinheiro } from '@/components/Dinheiro'
import { FormAcao } from '@/components/FormAcao'
import { StatusBadge } from '@/components/StatusBadge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Situacao } from '@/domain/financeiro'
import { gradeDoCiclo } from '@/features/financeiro/consultas'
import { nomeDoMes } from '@/features/grupo/textos'
import { responderProximoCicloAcao } from '@/features/rodadas/acoes'
import { janelaDeRevisao } from '@/features/rodadas/janela'
import { formatarDataCivil, formatarDataHora } from '@/lib/formato'
import { SITUACAO, STATUS_CICLO } from '@/lib/rotulos'
import { paginaExige } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Ciclo' }

// 07 §3.5: a "planilha" — situação de cada contribuição, com ícone e texto (nunca só cor).
function Celula({ situacao }: { situacao: Situacao | undefined }) {
  if (!situacao)
    return (
      <span className="text-muted-foreground" aria-label="não pagante">
        —
      </span>
    )
  const icones: Partial<Record<Situacao, typeof Check>> = {
    QUITADA: Check,
    NO_PRAZO: Clock,
    PRORROGADA: Clock,
    EM_ATRASO: TriangleAlert,
    QUITADA_EM_ATRASO: Check,
    AUTOQUITADA: Star,
  }
  const Icone = icones[situacao] ?? Clock
  const { rotulo, tom } = SITUACAO[situacao]
  const cor = {
    perigo: 'text-destructive',
    atencao: 'text-warning',
    sucesso: 'text-success',
    neutro: 'text-muted-foreground',
    inativo: 'text-muted-foreground',
  }[tom]
  return (
    <span className={`inline-flex items-center gap-1 ${cor}`} title={rotulo}>
      <Icone className="size-4" aria-hidden />
      <span className="sr-only">{rotulo}</span>
    </span>
  )
}

export default async function CicloPage({ params }: PageProps<'/ciclos/[numero]'>) {
  const { pessoaId } = await paginaExige(['MEMBRO'])
  const { numero } = await params
  const t = agora()
  const [g, janela] = await Promise.all([
    gradeDoCiclo(Number(numero), t),
    janelaDeRevisao(Number(numero), pessoaId, t),
  ])
  if (!g) notFound()
  const minha = janela?.membros.find((m) => m.eu)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo={`Ciclo ${String(g.ciclo.numero)}`}
        descricao={`Início em ${formatarDataCivil(g.ciclo.dataInicio)}.`}
        acoes={<StatusBadge {...STATUS_CICLO[g.ciclo.status]} />}
      />
      {janela && (
        <Card>
          <CardHeader>
            <CardTitle>Janela de revisão · ciclo {janela.numero}</CardTitle>
            <CardDescription>
              O ciclo {janela.numero} começa em {formatarDataCivil(janela.dataInicio)}. Confirme até{' '}
              {formatarDataHora(new Date(janela.prazo.getTime() - 60_000))}; dá para mudar de ideia
              até lá. Quem não confirmar deixa de ser membro no 1º sorteio, mas continua na família
              e com as dívidas (art. 44). Para valer já no 1º sorteio, uma alteração do Regulamento
              precisa ser aprovada até o último dia do mês anterior.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <ul className="flex flex-col divide-y rounded-lg border">
              {janela.membros.map((m) => (
                <li key={m.pessoaId} className="flex items-center justify-between px-3 py-2">
                  <span className="font-medium">
                    {m.apelido}
                    {m.eu && <span className="text-muted-foreground"> (você)</span>}
                  </span>
                  <StatusBadge
                    {...(m.resposta === 'CONFIRMA_PROXIMO_CICLO'
                      ? { rotulo: 'Confirmou', tom: 'sucesso' as const }
                      : m.resposta === 'RECUSA_PROXIMO_CICLO'
                        ? { rotulo: 'Não vai participar', tom: 'inativo' as const }
                        : { rotulo: 'Sem resposta', tom: 'atencao' as const })}
                  />
                </li>
              ))}
            </ul>
            {minha && janela.aberta && (
              <div className="flex flex-wrap gap-2">
                {minha.resposta !== 'CONFIRMA_PROXIMO_CICLO' && (
                  <FormAcao acao={responderProximoCicloAcao} sucesso="Participação confirmada">
                    <input type="hidden" name="cicloId" value={janela.cicloId} />
                    <input type="hidden" name="resposta" value="confirmo" />
                    <BotaoEnviar>Confirmo</BotaoEnviar>
                  </FormAcao>
                )}
                {minha.resposta !== 'RECUSA_PROXIMO_CICLO' && (
                  <FormAcao acao={responderProximoCicloAcao} sucesso="Resposta registrada">
                    <input type="hidden" name="cicloId" value={janela.cicloId} />
                    <input type="hidden" name="resposta" value="recuso" />
                    <BotaoEnviar variant="outline">Não vou participar</BotaoEnviar>
                  </FormAcao>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <caption className="sr-only">Grade de contribuições: participantes × rodadas</caption>
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="sticky left-0 bg-muted/50 px-3 py-2 text-left font-medium">
                Participante
              </th>
              {g.rodadas.map((r) => (
                <th
                  key={r.id}
                  scope="col"
                  className="px-3 py-2 text-center font-medium whitespace-nowrap"
                >
                  <Link
                    href={`/rodadas/${r.id}?aba=pagamentos`}
                    className="underline-offset-4 hover:underline"
                  >
                    {nomeDoMes(r.mesReferencia)}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.participantes.map((p) => (
              <tr key={p.pessoaId} className="border-t">
                <th
                  scope="row"
                  className="sticky left-0 bg-background px-3 py-2 text-left font-medium"
                >
                  {p.apelido}
                  {p.saiu && <span className="text-muted-foreground"> (saiu)</span>}
                </th>
                {g.rodadas.map((r) => {
                  const sit = g.situacaoDe[`${p.pessoaId}:${r.id}`]
                  return (
                    <td
                      key={r.id}
                      className="px-3 py-2 text-center"
                      aria-label={`${p.apelido}, ${nomeDoMes(r.mesReferencia)}: ${sit ? SITUACAO[sit].rotulo : 'não pagante'}`}
                    >
                      <Celula situacao={sit} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/30 text-xs">
            <tr>
              <th scope="row" className="sticky left-0 bg-muted/30 px-3 py-2 text-left font-medium">
                Contemplado
              </th>
              {g.rodadas.map((r) => (
                <td key={r.id} className="px-3 py-2 text-center">
                  {r.contemplado ?? '—'}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="sticky left-0 bg-muted/30 px-3 py-2 text-left font-medium">
                PRÊMIO
              </th>
              {g.rodadas.map((r) => (
                <td key={r.id} className="px-3 py-2 text-center">
                  {r.premioCentavos > 0 ? <Dinheiro centavos={r.premioCentavos} /> : '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Gasto e SOBRA por rodada entram com a compra do jogo; a conservação do ciclo (RN-FIN-18)
        também.
      </p>
    </div>
  )
}
