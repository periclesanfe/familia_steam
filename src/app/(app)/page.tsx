import type { Route } from 'next'
import Link from 'next/link'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Dinheiro } from '@/components/Dinheiro'
import { FormAcao } from '@/components/FormAcao'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pendenciasFinanceiras } from '@/features/financeiro/consultas'
import { nomeDoMes } from '@/features/grupo/textos'
import { type Pendencia, pendenciasDe } from '@/features/painel/pendencias'
import { proximoSorteio } from '@/features/rodadas/consultas'
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
  const [proximo, pend, transcritos, pendencias] = await Promise.all([
    perfil === 'MEMBRO' ? proximoSorteio() : null,
    pendenciasFinanceiras(pessoaId, t),
    transcritosParaMim(pessoaId),
    pendenciasDe(pessoaId, t),
  ])
  const venceAte = (d: Date) => formatarDataHora(new Date(d.getTime() - 60_000))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina titulo="Painel" />
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
      <Card>
        <CardHeader>
          <CardTitle>Agora</CardTitle>
          <CardDescription>
            {proximo
              ? `Ciclo ${String(proximo.ciclo.numero)} · rodada ${String(proximo.sequencia)} (${nomeDoMes(proximo.mesReferencia)})`
              : 'Nenhum sorteio agendado.'}
          </CardDescription>
        </CardHeader>
        {proximo && (
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              Próximo sorteio em{' '}
              <span className="font-medium">{formatarDataHora(proximo.agendadaPara)}</span>.
            </p>
            <Link
              href={`/rodadas/${proximo.id}`}
              className="w-fit font-medium underline underline-offset-4"
            >
              Ver a rodada, declarar que não vai concorrer ou justificar antecipadamente
            </Link>
          </CardContent>
        )}
      </Card>
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
