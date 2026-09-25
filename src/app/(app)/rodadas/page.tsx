import type { Metadata } from 'next'
import Link from 'next/link'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { StatusBadge } from '@/components/StatusBadge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { nomeDoMes } from '@/features/grupo/textos'
import { listarRodadas } from '@/features/rodadas/consultas'
import { formatarDataCivil, formatarDataHora } from '@/lib/formato'
import { STATUS_CICLO, STATUS_RODADA } from '@/lib/rotulos'
import { paginaExige } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'Rodadas' }

// 07 §1: rodadas do ciclo atual por padrão (?ciclo=N para outro).
export default async function RodadasPage({ searchParams }: PageProps<'/rodadas'>) {
  await paginaExige(['MEMBRO'])
  const { ciclo } = await searchParams
  const dados = await listarRodadas(
    typeof ciclo === 'string' ? Number(ciclo) || undefined : undefined,
  )

  if (!dados) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nenhum ciclo ainda</EmptyTitle>
            <EmptyDescription>
              O ciclo 1 nasce quando todos os fundadores assinam o Regulamento (art. 46).
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }
  const { ciclo: c, rodadas, ciclos } = dados
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo={`Rodadas do ciclo ${String(c.numero)}`}
        descricao={`Início em ${formatarDataCivil(c.dataInicio)}.`}
        acoes={<StatusBadge {...STATUS_CICLO[c.status]} />}
      />
      {ciclos.length > 1 && (
        <nav aria-label="Ciclos" className="flex flex-wrap gap-2 text-sm">
          {ciclos.map((x) => (
            <Link
              key={x.numero}
              href={`/rodadas?ciclo=${String(x.numero)}`}
              aria-current={x.numero === c.numero ? 'page' : undefined}
              className="underline-offset-4 hover:underline aria-[current=page]:font-semibold"
            >
              Ciclo {x.numero}
            </Link>
          ))}
        </nav>
      )}
      <ul className="flex flex-col divide-y rounded-lg border">
        {rodadas.map((r) => (
          <li key={r.id}>
            <Link
              href={`/rodadas/${r.id}`}
              className="flex flex-col gap-1 px-4 py-3 transition-colors duration-150 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex flex-col">
                <span className="font-medium">
                  Rodada {r.sequencia} · {nomeDoMes(r.mesReferencia)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {r.status === 'AGENDADA'
                    ? `Sorteio em ${formatarDataHora(r.agendadaPara)}`
                    : r.contemplado
                      ? `Contemplado: ${r.contemplado.apelido}`
                      : 'Sem contemplado'}
                  {r.atrasada && ' · realizado com atraso'}
                </span>
              </span>
              <StatusBadge {...STATUS_RODADA[r.status]} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
