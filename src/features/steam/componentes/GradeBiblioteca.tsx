'use client'

import { Search } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { PessoaAvatar } from '@/components/PessoaAvatar'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

export type JogoDaFamilia = {
  appId: number
  nome: string
  imagemUrl: string
  compartilhavel: 'SIM' | 'NAO' | 'VERIFICANDO'
  generos: string[]
  avaliacao: { rotulo: string; pct: number | null } | null
  horas: number
  copias: number
  donos: { id: string; apelido: string; avatarUrl: string | null; horas: number }[]
}

type Filtro = 'todos' | 'compartilhaveis' | 'verificando' | 'repetidos'
type Ordem = 'nome' | 'horas' | 'copias' | 'avaliacao'

const PAGINA = 48
const SELO = {
  SIM: { rotulo: 'Compartilhável', tom: 'sucesso' },
  NAO: { rotulo: 'Não compartilha', tom: 'inativo' },
  VERIFICANDO: { rotulo: 'Verificando…', tom: 'neutro' },
} as const

// 15 §5 / RN-STM-12: grade de capas da biblioteca da família; filtros no cliente (dados já vieram).
export function GradeBiblioteca({ jogos }: { jogos: JogoDaFamilia[] }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [dono, setDono] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('nome')
  const [limite, setLimite] = useState(PAGINA)

  const pessoas = [
    ...new Map(jogos.flatMap((j) => j.donos.map((d) => [d.id, d.apelido] as const))),
  ].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  const termo = busca.trim().toLocaleLowerCase('pt-BR')
  const visiveis = jogos
    .filter(
      (j) =>
        (filtro !== 'compartilhaveis' || j.compartilhavel === 'SIM') &&
        (filtro !== 'verificando' || j.compartilhavel === 'VERIFICANDO') &&
        (filtro !== 'repetidos' || j.copias > 1) &&
        (!dono || j.donos.some((d) => d.id === dono)) &&
        (!termo || j.nome.toLocaleLowerCase('pt-BR').includes(termo)),
    )
    .sort((a, b) =>
      ordem === 'horas'
        ? b.horas - a.horas
        : ordem === 'copias'
          ? b.copias - a.copias
          : ordem === 'avaliacao'
            ? (b.avaliacao?.pct ?? -1) - (a.avaliacao?.pct ?? -1)
            : a.nome.localeCompare(b.nome, 'pt-BR'),
    )
  const trocar =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v)
      setLimite(PAGINA)
    }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-56">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Buscar jogo"
            aria-label="Buscar jogo"
            value={busca}
            onChange={(e) => {
              trocar(setBusca)(e.currentTarget.value)
            }}
          />
        </InputGroup>
        <NativeSelect
          aria-label="Filtrar"
          value={filtro}
          onChange={(e) => {
            trocar(setFiltro)(e.currentTarget.value as Filtro)
          }}
        >
          <NativeSelectOption value="todos">Todos</NativeSelectOption>
          <NativeSelectOption value="compartilhaveis">Compartilháveis</NativeSelectOption>
          <NativeSelectOption value="verificando">Verificando</NativeSelectOption>
          <NativeSelectOption value="repetidos">Mais de uma cópia</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label="Dono"
          value={dono}
          onChange={(e) => {
            trocar(setDono)(e.currentTarget.value)
          }}
        >
          <NativeSelectOption value="">Todos os donos</NativeSelectOption>
          {pessoas.map(([id, apelido]) => (
            <NativeSelectOption key={id} value={id}>
              {apelido}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Ordenar"
          value={ordem}
          onChange={(e) => {
            trocar(setOrdem)(e.currentTarget.value as Ordem)
          }}
        >
          <NativeSelectOption value="nome">Nome</NativeSelectOption>
          <NativeSelectOption value="horas">Mais jogados</NativeSelectOption>
          <NativeSelectOption value="copias">Mais cópias</NativeSelectOption>
          <NativeSelectOption value="avaliacao">Melhor avaliados</NativeSelectOption>
        </NativeSelect>
        <span className="text-sm text-muted-foreground tabular-nums sm:ml-auto">
          {visiveis.length} de {jogos.length}
        </span>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visiveis.slice(0, limite).map((j) => (
          <li key={j.appId}>
            <Link
              href={`/jogos/${String(j.appId)}`}
              className="flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-colors duration-150 hover:border-primary/50"
            >
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- CDN da Steam, sem otimizador (13 DP-12) */}
                <img
                  src={j.imagemUrl}
                  alt=""
                  loading="lazy"
                  className="aspect-[460/215] w-full bg-muted object-cover"
                />
                {j.copias > 1 && (
                  <span className="absolute top-2 left-2 rounded bg-background/85 px-1.5 py-0.5 text-xs font-medium tabular-nums">
                    {j.copias} cópias
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <span className="line-clamp-1 font-medium" title={j.nome}>
                  {j.nome}
                </span>
                {(j.generos.length > 0 || j.avaliacao) && (
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {[
                      j.generos.slice(0, 2).join(' · '),
                      j.avaliacao &&
                        `${j.avaliacao.rotulo}${j.avaliacao.pct !== null ? ` ${String(j.avaliacao.pct)}%` : ''}`,
                    ]
                      .filter(Boolean)
                      .join(' — ')}
                  </span>
                )}
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="flex -space-x-2 [&_[data-slot=avatar]]:size-6 [&_[data-slot=avatar]]:ring-2 [&_[data-slot=avatar]]:ring-card">
                      {j.donos.slice(0, 4).map((d) => (
                        <span key={d.id} title={`${d.apelido} · ${String(d.horas)} h`}>
                          <PessoaAvatar apelido={d.apelido} url={d.avatarUrl} />
                        </span>
                      ))}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {j.horas.toLocaleString('pt-BR')} h
                    </span>
                  </span>
                  <StatusBadge {...SELO[j.compartilhavel]} />
                </div>
              </div>
            </Link>
          </li>
        ))}
        {visiveis.length === 0 && (
          <li className="text-sm text-muted-foreground">Nada com esses filtros.</li>
        )}
      </ul>
      {visiveis.length > limite && (
        <Button
          variant="outline"
          className="self-center"
          onClick={() => {
            setLimite((l) => l + PAGINA)
          }}
        >
          Mostrar mais ({visiveis.length - limite})
        </Button>
      )}
    </div>
  )
}
