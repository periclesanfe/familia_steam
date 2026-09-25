import type { Metadata } from 'next'
import Link from 'next/link'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { PessoaAvatar } from '@/components/PessoaAvatar'
import { listarMembros } from '@/features/steam/consultas'
import { formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'Membros' }

// 07 §1: membros e ex-membros.
export default async function MembrosPage() {
  await paginaExige(['MEMBRO'])
  const membros = await listarMembros()
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina titulo="Membros" />
      <ul className="flex flex-col divide-y rounded-lg border">
        {membros.map((m) => (
          <li key={m.id}>
            <Link
              href={`/membros/${m.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted/50"
            >
              <PessoaAvatar apelido={m.apelido} url={m.steamAvatarUrl} />
              <span className="flex flex-1 flex-col">
                <span className="font-medium">
                  {m.apelido}
                  {m.steamNick && (
                    <span className="font-normal text-muted-foreground"> · {m.steamNick}</span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {m.membros[0]?.status.toLowerCase().replaceAll('_', ' ')} · {m._count.jogos} jogos
                  {m.steamSincronizadoEm
                    ? ` · Steam em ${formatarDataHora(m.steamSincronizadoEm)}`
                    : ' · Steam ainda não sincronizada'}
                  {m.steamJogosPublicos === false && ' · biblioteca privada'}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
