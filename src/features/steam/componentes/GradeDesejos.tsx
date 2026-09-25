'use client'

import Link from 'next/link'
import { useState } from 'react'

import { StatusBadge } from '@/components/StatusBadge'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { formatarBRL } from '@/domain/dinheiro'

export type Desejo = {
  id: string
  appId: number | null
  nome: string
  posicao: number
  imagemUrl: string | null
  precoCentavos: number | null
  precoInicialCentavos: number | null
  descontoPct: number | null
  menorPrecoCentavos: number | null
  gratuito: boolean | null
  generos: string[]
  metacritic: number | null
  avaliacao: { rotulo: string; pct: number | null } | null
  emBreve: boolean | null
  compartilhavel: 'SIM' | 'NAO' | 'VERIFICANDO'
  bloqueado: boolean
}

type Filtro = 'todos' | 'promocao' | 'compartilhaveis'
type Ordem = 'steam' | 'desconto' | 'preco'

const emPromocao = (d: Desejo) => (d.descontoPct ?? 0) > 0

// 15 §5: lista de desejos com preço, desconto e menor preço observado; filtros no cliente.
export function GradeDesejos({ itens }: { itens: Desejo[] }) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [ordem, setOrdem] = useState<Ordem>('steam')
  const [teto, setTeto] = useState('')
  const tetoCentavos = teto ? Math.round(Number(teto.replace(',', '.')) * 100) : null
  const promocoes = itens.filter(emPromocao)
  const economia = promocoes.reduce(
    (s, d) => s + ((d.precoInicialCentavos ?? 0) - (d.precoCentavos ?? 0)),
    0,
  )
  const visiveis = itens
    .filter((d) =>
      filtro === 'promocao'
        ? emPromocao(d)
        : filtro === 'compartilhaveis'
          ? d.compartilhavel === 'SIM'
          : true,
    )
    .filter((d) => tetoCentavos === null || (d.precoCentavos ?? Infinity) <= tetoCentavos)
    .sort((a, b) =>
      ordem === 'desconto'
        ? (b.descontoPct ?? 0) - (a.descontoPct ?? 0)
        : ordem === 'preco'
          ? (a.precoCentavos ?? Infinity) - (b.precoCentavos ?? Infinity)
          : a.posicao - b.posicao,
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {promocoes.length > 0 ? (
            <>
              <span className="font-medium text-success">{promocoes.length} em promoção agora</span>{' '}
              · economia de {formatarBRL(economia)} somando os descontos
            </>
          ) : (
            'Nenhum item em promoção agora.'
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label="Filtrar"
            value={filtro}
            onChange={(e) => {
              setFiltro(e.currentTarget.value as Filtro)
            }}
          >
            <NativeSelectOption value="todos">Todos ({itens.length})</NativeSelectOption>
            <NativeSelectOption value="promocao">
              Em promoção ({promocoes.length})
            </NativeSelectOption>
            <NativeSelectOption value="compartilhaveis">Compartilháveis</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            aria-label="Ordenar"
            value={ordem}
            onChange={(e) => {
              setOrdem(e.currentTarget.value as Ordem)
            }}
          >
            <NativeSelectOption value="steam">Ordem da Steam</NativeSelectOption>
            <NativeSelectOption value="desconto">Maior desconto</NativeSelectOption>
            <NativeSelectOption value="preco">Menor preço</NativeSelectOption>
          </NativeSelect>
          <InputGroup className="w-36">
            <InputGroupAddon>até R$</InputGroupAddon>
            <InputGroupInput
              inputMode="decimal"
              aria-label="Preço máximo"
              value={teto}
              onChange={(e) => {
                setTeto(e.currentTarget.value)
              }}
            />
          </InputGroup>
        </div>
      </div>

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.map((d) => {
          const desconto = d.descontoPct ?? 0
          const noMenor =
            d.menorPrecoCentavos !== null &&
            d.precoCentavos !== null &&
            desconto > 0 &&
            d.precoCentavos <= d.menorPrecoCentavos
          const conteudo = (
            <>
              <div className="relative">
                {d.imagemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- CDN da Steam, sem otimizador (08 §8.2)
                  <img
                    src={d.imagemUrl}
                    alt=""
                    loading="lazy"
                    className="aspect-[460/215] w-full rounded-t-lg object-cover"
                  />
                ) : (
                  <div className="aspect-[460/215] w-full rounded-t-lg bg-muted" />
                )}
                <span className="absolute top-2 left-2 rounded bg-background/85 px-1.5 py-0.5 text-xs font-medium tabular-nums">
                  #{d.posicao}
                </span>
                {desconto > 0 && (
                  <span className="absolute top-2 right-2 rounded bg-success px-2 py-0.5 text-sm font-bold text-background tabular-nums">
                    -{desconto}%
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <span className="line-clamp-2 font-medium">{d.nome}</span>
                {d.generos.length > 0 && (
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {d.generos.slice(0, 3).join(' · ')}
                  </span>
                )}
                {d.avaliacao && (
                  <span className="text-xs text-muted-foreground">
                    {d.avaliacao.rotulo}
                    {d.avaliacao.pct !== null && ` · ${String(d.avaliacao.pct)}%`}
                  </span>
                )}
                <div className="mt-auto flex items-end justify-between gap-2">
                  <span className="flex flex-col">
                    {d.gratuito ? (
                      <span className="font-semibold">Gratuito</span>
                    ) : d.precoCentavos !== null ? (
                      <>
                        {desconto > 0 && d.precoInicialCentavos !== null && (
                          <span className="text-xs text-muted-foreground tabular-nums line-through">
                            {formatarBRL(d.precoInicialCentavos)}
                          </span>
                        )}
                        <span
                          className={`text-lg font-semibold tabular-nums ${desconto > 0 ? 'text-success' : ''}`}
                        >
                          {formatarBRL(d.precoCentavos)}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {d.emBreve ? 'Pré-venda / em breve' : 'Sem preço'}
                      </span>
                    )}
                    {noMenor ? (
                      <span className="text-xs font-medium text-success">Menor preço já visto</span>
                    ) : d.menorPrecoCentavos !== null &&
                      d.precoCentavos !== null &&
                      d.menorPrecoCentavos < d.precoCentavos ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Menor visto: {formatarBRL(d.menorPrecoCentavos)}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    {d.metacritic !== null && (
                      <span
                        className="rounded border px-1.5 text-xs font-semibold tabular-nums"
                        title="Metacritic"
                      >
                        {d.metacritic}
                      </span>
                    )}
                    {d.bloqueado ? (
                      <StatusBadge rotulo="Anexo I" tom="perigo" />
                    ) : d.compartilhavel === 'SIM' ? (
                      <StatusBadge rotulo="Compartilhável" tom="sucesso" />
                    ) : d.compartilhavel === 'NAO' ? (
                      <StatusBadge rotulo="Não compartilha" tom="inativo" />
                    ) : null}
                  </span>
                </div>
              </div>
            </>
          )
          return (
            <li key={d.id}>
              {d.appId ? (
                <Link
                  href={`/jogos/${String(d.appId)}`}
                  className="flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-colors duration-150 hover:border-primary/50"
                >
                  {conteudo}
                </Link>
              ) : (
                <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
                  {conteudo}
                </div>
              )}
            </li>
          )
        })}
        {visiveis.length === 0 && (
          <li className="text-sm text-muted-foreground">Nada com esses filtros.</li>
        )}
      </ol>
    </div>
  )
}
