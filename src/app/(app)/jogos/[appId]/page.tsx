import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Dinheiro } from '@/components/Dinheiro'
import { StatusBadge } from '@/components/StatusBadge'
import { capaDoApp } from '@/domain/steam'
import { dataLocal } from '@/domain/tempo'
import { GaleriaCapturas } from '@/features/steam/componentes/GaleriaCapturas'
import { detalheDoJogo } from '@/features/steam/consultas'
import { formatarDataCivil, formatarDataHora } from '@/lib/formato'
import { paginaExige, TODOS_OS_PERFIS } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'Jogo' }

// 07 §3.11 / 15 §5: capturas, avaliações, ficha da loja, preço, categorias relevantes, descritores, quem possui, quem deseja, bloqueio.
export default async function JogoPage({ params }: PageProps<'/jogos/[appId]'>) {
  await paginaExige(TODOS_OS_PERFIS) // 15 §1: a lista pessoal de qualquer perfil aponta para cá
  const { appId } = await params
  const id = Number(appId)
  if (!Number.isSafeInteger(id) || id <= 0) notFound()
  const j = await detalheDoJogo(id)
  const a = j.app

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {a && a.capturas.length > 0 ? (
          <GaleriaCapturas
            miniaturas={a.capturas}
            grandes={a.capturasGrandes}
            nome={a.nome ?? `App ${String(id)}`}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- capa do CDN da Steam, sem otimizador (13 DP-12)
          <img
            src={a?.imagemUrl ?? capaDoApp(id)}
            alt=""
            className="aspect-[460/215] w-full rounded-lg border bg-muted object-cover"
          />
        )}
        <aside className="flex flex-col gap-4 text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
          <img
            src={a?.imagemUrl ?? capaDoApp(id)}
            alt=""
            className="hidden aspect-[460/215] w-full rounded-lg border bg-muted object-cover lg:block"
          />
          {a?.descricaoCurta && <p className="leading-relaxed">{a.descricaoCurta}</p>}
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Avaliações da loja</span>
            {j.avaliacao ? (
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge rotulo={j.avaliacao.rotulo} tom={j.avaliacao.tom} />
                {j.avaliacao.pct !== null && (
                  <span className="text-muted-foreground tabular-nums">
                    {j.avaliacao.pct}% de {j.avaliacao.total.toLocaleString('pt-BR')}
                  </span>
                )}
              </span>
            ) : (
              <span>—</span>
            )}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            {a?.lancamento && (
              <>
                <dt className="text-muted-foreground">Lançamento</dt>
                <dd>{a.lancamento}</dd>
              </>
            )}
            {a && a.desenvolvedoras.length > 0 && (
              <>
                <dt className="text-muted-foreground">Desenvolvedora</dt>
                <dd>{a.desenvolvedoras.join(', ')}</dd>
              </>
            )}
            {a && a.publicadoras.length > 0 && (
              <>
                <dt className="text-muted-foreground">Distribuidora</dt>
                <dd>{a.publicadoras.join(', ')}</dd>
              </>
            )}
            {a?.metacritic != null && (
              <>
                <dt className="text-muted-foreground">Metacritic</dt>
                <dd className="font-semibold tabular-nums">{a.metacritic}</dd>
              </>
            )}
          </dl>
          {a && a.generos.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {a.generos.map((g) => (
                <li key={g} className="rounded-md bg-secondary px-2 py-0.5 text-xs">
                  {g}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Preço</dt>
          <dd className="flex flex-wrap items-baseline gap-x-2">
            {a?.gratuito ? (
              'Gratuito'
            ) : a?.precoFinalCentavos != null ? (
              <>
                <Dinheiro
                  centavos={a.precoFinalCentavos}
                  className={(a.descontoPct ?? 0) > 0 ? 'font-semibold text-success' : ''}
                />
                {(a.descontoPct ?? 0) > 0 && a.precoInicialCentavos !== null && (
                  <span className="text-xs text-muted-foreground">
                    -{a.descontoPct}% de <Dinheiro centavos={a.precoInicialCentavos} />
                  </span>
                )}
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Menor preço visto</dt>
          <dd>
            {j.menorPrecoCentavos !== null ? <Dinheiro centavos={j.menorPrecoCentavos} /> : '—'}
            {j.precosDesde && (
              <span className="block text-xs text-muted-foreground">
                desde {formatarDataCivil(dataLocal(j.precosDesde))}
              </span>
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
