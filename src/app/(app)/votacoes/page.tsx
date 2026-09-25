import type { Metadata } from 'next'
import Link from 'next/link'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { nomeDoAssunto } from '@/domain/ata'
import { listarVotacoes } from '@/features/votacoes/consultas'
import { formatarDataHora } from '@/lib/formato'
import { STATUS_VOTACAO } from '@/lib/rotulos'
import { paginaExige } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'Votações' }

// 07 §3.7: abertas (com "você ainda não votou") e encerradas (resultado e ATA).
export default async function VotacoesPage() {
  const { pessoaId } = await paginaExige(['MEMBRO'])
  const votacoes = await listarVotacoes(pessoaId)
  const abertas = votacoes.filter((v) => v.status === 'ABERTA')
  const encerradas = votacoes.filter((v) => v.status !== 'ABERTA')

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo="Votações"
        descricao="Decisões por maioria absoluta, sempre com ATA (art. 41)."
        acoes={
          <Button asChild>
            <Link href="/votacoes/nova">Convocar votação</Link>
          </Button>
        }
      />
      <section aria-labelledby="abertas" className="flex flex-col gap-3">
        <h2 id="abertas" className="text-lg font-semibold">
          Abertas
        </h2>
        {abertas.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Nenhuma votação aberta</EmptyTitle>
              <EmptyDescription>
                Votações nascem de um aviso de jogo, de uma cessão ou de uma convocação.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {abertas.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/votacoes/${v.id}`}
                  className="flex flex-col gap-1 px-4 py-3 transition-colors duration-150 hover:bg-muted/50"
                >
                  <span className="font-medium">
                    {nomeDoAssunto(v.assunto)}: {v.proposicao}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Encerra até {formatarDataHora(v.encerraEm)}
                    {v.possoVotar && !v.euVotei && (
                      <span className="font-medium text-warning"> · você ainda não votou</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {encerradas.length > 0 && (
        <section aria-labelledby="encerradas" className="flex flex-col gap-3">
          <h2 id="encerradas" className="text-lg font-semibold">
            Encerradas
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border">
            {encerradas.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/votacoes/${v.id}`}
                  className="flex flex-col gap-1 px-4 py-3 transition-colors duration-150 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {nomeDoAssunto(v.assunto)}: {v.proposicao}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {v.encerradaEm && `Encerrada em ${formatarDataHora(v.encerradaEm)}`}
                      {v.ata && ` · ATA nº ${String(v.ata.numero)}`}
                    </span>
                  </span>
                  <StatusBadge {...STATUS_VOTACAO[v.status]} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
