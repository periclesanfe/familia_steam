import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Dinheiro } from '@/components/Dinheiro'
import { StatusBadge } from '@/components/StatusBadge'
import { detalheDoJogo } from '@/features/steam/consultas'
import { formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'Jogo' }

// 07 §3.11: capa, tipo, preço, categorias relevantes, descritores, quem possui, quem deseja, bloqueio.
export default async function JogoPage({ params }: PageProps<'/jogos/[appId]'>) {
  await paginaExige(['MEMBRO'])
  const { appId } = await params
  const id = Number(appId)
  if (!Number.isSafeInteger(id) || id <= 0) notFound()
  const j = await detalheDoJogo(id)
  const a = j.app

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo={a?.nome ?? `App ${String(id)}`}
        descricao={
          <a
            href={`https://store.steampowered.com/app/${String(id)}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            Ver na loja Steam
          </a>
        }
        acoes={
          j.bloqueio && (
            <StatusBadge
              rotulo={`Anexo I nº ${String(j.bloqueio.numero).padStart(2, '0')}`}
              tom="perigo"
            />
          )
        }
      />
      {a?.imagemUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- capa do CDN da Steam, sem otimizador (13 DP-12)
        <img
          src={a.imagemUrl}
          alt=""
          width={460}
          height={215}
          className="aspect-[460/215] w-full rounded-lg border object-cover"
        />
      )}
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Tipo</dt>
          <dd>{a?.tipo ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Preço</dt>
          <dd>
            {a?.gratuito ? (
              'Gratuito'
            ) : a?.precoFinalCentavos != null ? (
              <Dinheiro centavos={a.precoFinalCentavos} />
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Compartilhável</dt>
          <dd>
            {
              { SIM: 'Sim (categoria 62)', NAO: 'Não', VERIFICANDO: 'Verificando…' }[
                j.compartilhavel
              ]
            }
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Conteúdo</dt>
          <dd>
            {!a?.sucesso
              ? '—'
              : a.descritoresConteudo.includes(3)
                ? 'Só para adultos (art. 17)'
                : a.descritoresConteudo.some((d) => d === 1 || d === 4)
                  ? 'Nudez ou conteúdo sexual'
                  : 'Sem alerta'}
          </dd>
        </div>
      </dl>
      {j.bloqueio && (
        <p className="text-sm text-destructive">
          Bloqueado pelo Anexo I (entrada {String(j.bloqueio.numero).padStart(2, '0')}):{' '}
          {j.bloqueio.motivo}
        </p>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="donos" className="flex flex-col gap-2">
          <h2 id="donos" className="text-lg font-semibold">
            Quem tem
          </h2>
          {j.donos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ninguém (entre as bibliotecas públicas).
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {j.donos.map((d) => (
                <li key={d.pessoa.id}>
                  <Link
                    href={`/membros/${d.pessoa.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {d.pessoa.apelido}
                  </Link>
                  <span className="text-muted-foreground">
                    {' '}
                    · {Math.round(d.minutosJogados / 60)} h
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="querem" className="flex flex-col gap-2">
          <h2 id="querem" className="text-lg font-semibold">
            Quem deseja
          </h2>
          {j.desejos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {j.desejos.map((d) => (
                <li key={d.pessoa.id}>
                  <Link
                    href={`/membros/${d.pessoa.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {d.pessoa.apelido}
                  </Link>
                  <span className="text-muted-foreground"> · posição {d.posicao}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {a?.detalhesEm && (
        <p className="text-xs text-muted-foreground">
          Dados da loja de {formatarDataHora(a.detalhesEm)}.
        </p>
      )}
    </div>
  )
}
