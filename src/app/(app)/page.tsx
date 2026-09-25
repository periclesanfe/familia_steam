import { ArrowDownLeft, ArrowUpRight, CalendarClock, Trophy } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Dinheiro } from '@/components/Dinheiro'
import { FormAcao } from '@/components/FormAcao'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pendenciasFinanceiras } from '@/features/financeiro/consultas'
import { nomeDoMes } from '@/features/grupo/textos'
import { GraficosPainel } from '@/features/painel/componentes/Graficos'
import { resumoDoPainel } from '@/features/painel/consultas'
import { type Pendencia, pendenciasDe } from '@/features/painel/pendencias'
import { revogarTranscricaoAcao } from '@/features/transcricao/acoes'
import { transcritosParaMim } from '@/features/transcricao/servico'
import { formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

const TIPO_TRANSCRITO: Partial<Record<string, string>> = {
  NAO_CONCORRER: 'Não vai concorrer',
  CONFIRMA_PROXIMO_CICLO: 'Confirmou o próximo ciclo',
  RECUSA_PROXIMO_CICLO: 'Não vai participar do próximo ciclo',
}

// 07 §3.3 e §4: Painel com as pendências minhas e do grupo.
export default async function PainelPage() {
  const { perfil, pessoaId } = await paginaExige(['MEMBRO', 'EX_COM_PENDENCIA', 'EX_QUITADO'])
  const t = agora()
  const [pend, transcritos, pendencias, resumo] = await Promise.all([
    pendenciasFinanceiras(pessoaId, t),
    transcritosParaMim(pessoaId),
    pendenciasDe(pessoaId, t),
    resumoDoPainel(pessoaId, t),
  ])
  const proximo = perfil === 'MEMBRO' ? resumo.proximo : null
  const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0)
  const venceAte = (d: Date) => formatarDataHora(new Date(d.getTime() - 60_000))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo="Painel"
        descricao={
          resumo.ciclo
            ? `Ciclo ${String(resumo.ciclo.numero)} · ${String(resumo.ciclo.contemplados)} de ${String(resumo.ciclo.participantes)} já contemplados`
            : 'O ciclo 1 começa quando todos assinarem o Regulamento.'
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Prêmio do mês"
          Icone={Trophy}
          valor={resumo.atual ? <Dinheiro centavos={resumo.atual.premioCentavos} /> : '—'}
          detalhe={
            resumo.atual
              ? `${resumo.atual.contemplado} · ${resumo.atual.mes}`
              : 'Nenhuma rodada aberta'
          }
          progresso={
            resumo.atual
              ? pct(resumo.atual.arrecadadoCentavos, resumo.atual.premioCentavos)
              : undefined
          }
          href={resumo.atual ? (`/rodadas/${resumo.atual.id}?aba=pagamentos` as Route) : undefined}
        />
        <Indicador
          titulo="Próximo sorteio"
          Icone={CalendarClock}
          valor={proximo ? formatarDataHora(proximo.agendadaPara).split(' ')[0] : '—'}
          detalhe={
            proximo
              ? `${nomeDoMes(proximo.mesReferencia)} · em ${String(Math.max(0, Math.ceil((proximo.agendadaPara.getTime() - t.getTime()) / 86_400_000)))} dia(s)`
              : 'Nada agendado'
          }
          href={proximo ? (`/rodadas/${proximo.id}` as Route) : undefined}
        />
        <Indicador
          titulo="Você deve"
          Icone={ArrowUpRight}
          valor={<Dinheiro centavos={resumo.contas.devo} />}
          detalhe={resumo.contas.devo > 0 ? 'Veja as pendências abaixo' : 'Tudo em dia'}
          tom={resumo.contas.devo > 0 ? 'atencao' : 'sucesso'}
        />
        <Indicador
          titulo="A receber"
          Icone={ArrowDownLeft}
          valor={<Dinheiro centavos={resumo.contas.aReceber} />}
          detalhe="Pix que outros ainda devem a você"
        />
      </div>

      <GraficosPainel {...resumo.series} />

      {(pend.pagar.length > 0 || pend.aConfirmar.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Minhas pendências</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {pend.pagar.map((o) => (
                <li key={o.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between">
                  <span>
                    Pagar <Dinheiro centavos={o.saldoCentavos} className="font-medium" /> a{' '}
                    {o.credor} até {venceAte(o.vencimentoEfetivo)}
                    {o.situacao === 'EM_ATRASO' && (
                      <span className="text-destructive"> · em atraso</span>
                    )}
                  </span>
                  <Link
                    href={`/rodadas/${o.rodada.id}?aba=pagamentos`}
                    className="font-medium underline underline-offset-4"
                  >
                    Paguei / justificar
                  </Link>
                </li>
              ))}
              {pend.aConfirmar.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between">
                  <span>
                    Confirmar recebimento de{' '}
                    <Dinheiro centavos={p.valorCentavos} className="font-medium" /> de{' '}
                    {p.obrigacao.devedor.apelido} (Pix em {formatarDataHora(p.pixEm)})
                  </span>
                  <Link
                    href={`/rodadas/${p.obrigacao.rodadaId}?aba=pagamentos`}
                    className="font-medium underline underline-offset-4"
                  >
                    Confirmar ou contestar
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {pendencias.minhas.length > 0 && (
        <ListaPendencias titulo="Para você" itens={pendencias.minhas} />
      )}
      {transcritos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Atos transcritos em seu nome</CardTitle>
            <CardDescription>
              Outro membro registrou estes atos a partir do GRUPO. Se não foi isso, revogue antes do
              sorteio (RN-GER-05).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {transcritos.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    {TIPO_TRANSCRITO[d.tipo] ?? d.tipo} · mensagem de{' '}
                    {formatarDataHora(d.efetivaEm)} · transcrito por {d.transcritoPor}
                  </span>
                  <FormAcao acao={revogarTranscricaoAcao} sucesso="Revogado">
                    <input type="hidden" name="declaracaoId" value={d.id} />
                    <BotaoEnviar size="sm" variant="outline">
                      Revogar
                    </BotaoEnviar>
                  </FormAcao>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {pendencias.grupo.length > 0 && (
        <ListaPendencias
          titulo="Do grupo"
          descricao="Qualquer membro pode encaminhar."
          itens={pendencias.grupo}
        />
      )}
    </div>
  )
}

function ListaPendencias({
  titulo,
  descricao,
  itens,
}: {
  titulo: string
  descricao?: string
  itens: Pendencia[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y text-sm">
          {itens.map((p) => (
            <li key={p.chave} className="py-2">
              <Link
                href={p.href as Route}
                className={`underline-offset-4 hover:underline ${p.urgente ? 'font-medium' : ''}`}
              >
                {p.texto}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** Card de indicador do painel (12 UI-03: o número vem com texto, a barra é complemento). */
function Indicador({
  titulo,
  Icone,
  valor,
  detalhe,
  progresso,
  href,
  tom,
}: {
  titulo: string
  Icone: typeof Trophy
  valor: React.ReactNode
  detalhe: string
  progresso?: number | undefined
  href?: Route | undefined
  tom?: 'atencao' | 'sucesso'
}) {
  const corpo = (
    <Card className="h-full transition-colors duration-150 hover:border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardDescription className="font-medium">{titulo}</CardDescription>
        <span
          className={`flex size-8 items-center justify-center rounded-md ${tom === 'atencao' ? 'bg-warning/10 text-warning' : tom === 'sucesso' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}
        >
          <Icone className="size-4" aria-hidden />
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="text-2xl font-semibold tabular-nums">{valor}</div>
        <p className="text-xs text-muted-foreground">{detalhe}</p>
        {progresso !== undefined && (
          <div className="flex items-center gap-2">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progresso}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Arrecadado do prêmio"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${String(Math.min(100, progresso))}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{progresso}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
  return href ? (
    <Link
      href={href}
      className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {corpo}
    </Link>
  ) : (
    corpo
  )
}
