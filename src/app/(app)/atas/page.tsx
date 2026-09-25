import type { Metadata } from 'next'
import Link from 'next/link'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { StatusBadge } from '@/components/StatusBadge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { nomeDoAssunto } from '@/domain/ata'
import { deDb } from '@/domain/tempo'
import { listarAtas } from '@/features/votacoes/consultas'
import { formatarDataCivil } from '@/lib/formato'
import { STATUS_VOTACAO } from '@/lib/rotulos'
import { paginaExige } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'ATAs' }

// 07 §1: lista de ATAs (art. 2º, VIII).
export default async function AtasPage() {
  await paginaExige(['MEMBRO'])
  const atas = await listarAtas()
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo="ATAs"
        descricao="Registro imutável de cada votação encerrada, no modelo do Anexo II."
      />
      {atas.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nenhuma ATA ainda</EmptyTitle>
            <EmptyDescription>
              Toda votação aprovada ou rejeitada gera uma ATA numerada.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {atas.map((a) => (
            <li key={a.numero}>
              <Link
                href={`/atas/${String(a.numero)}`}
                className="flex flex-col gap-1 px-4 py-3 transition-colors duration-150 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    ATA nº {a.numero} · {nomeDoAssunto(a.votacao.assunto)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatarDataCivil(deDb(a.data))} · {a.votacao.proposicao}
                  </span>
                </span>
                <StatusBadge {...STATUS_VOTACAO[a.votacao.status]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
