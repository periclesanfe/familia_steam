import type { Metadata } from 'next'
import Link from 'next/link'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { instanteLocal, somarDiasCorridos } from '@/domain/tempo'
import { trilha } from '@/features/auditoria/consultas'
import { formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'Auditoria' }

const texto = (v: string | string[] | undefined) =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined
const data = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)

// 07 §3.15: trilha append-only, filtrável por entidade, ator, ação e período (RN-ACE-07).
export default async function AuditoriaPage({ searchParams }: PageProps<'/auditoria'>) {
  await paginaExige(['MEMBRO'])
  const sp = await searchParams
  const de = data(texto(sp.de))
  const ate = data(texto(sp.ate))
  const filtro = {
    entidade: texto(sp.entidade),
    ator: texto(sp.ator),
    acao: texto(sp.acao),
    de: de ? instanteLocal(de) : undefined,
    ate: ate ? instanteLocal(somarDiasCorridos(ate, 1)) : undefined,
    antesDe: Number(texto(sp.antes)) || undefined,
  }
  const t = await trilha(filtro)
  const proxima = new URLSearchParams(
    Object.entries({ ...sp, antes: String(t.proxima ?? '') }).flatMap(([k, v]) =>
      typeof v === 'string' && v ? [[k, v]] : [],
    ),
  )

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo="Auditoria"
        descricao="Tudo o que foi feito no sistema, por quem e quando. Só se acrescenta; nada se apaga."
      />
      <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:items-end" role="search">
        <label className="flex flex-col gap-1 text-sm">
          Entidade
          <NativeSelect name="entidade" defaultValue={filtro.entidade ?? ''}>
            <NativeSelectOption value="">Todas</NativeSelectOption>
            {t.entidades.map((e) => (
              <NativeSelectOption key={e} value={e}>
                {e}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Quem
          <NativeSelect name="ator" defaultValue={filtro.ator ?? ''}>
            <NativeSelectOption value="">Todos</NativeSelectOption>
            {t.pessoas.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.apelido}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Ação começa com
          <Input name="acao" defaultValue={filtro.acao} placeholder="pagamento." />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          De
          <Input name="de" type="date" defaultValue={de} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Até
          <Input name="ate" type="date" defaultValue={ate} />
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {t.eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento com esses filtros.</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border text-sm">
          {t.eventos.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 px-4 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="font-mono text-xs">{e.acao}</span>{' '}
                  <span className="text-muted-foreground">
                    · {e.entidade} · por {e.ator}
                    {e.ataNumero !== null && ` · ATA nº ${String(e.ataNumero)}`}
                  </span>
                </span>
                <time
                  dateTime={e.ocorridoEm.toISOString()}
                  className="text-xs text-muted-foreground tabular-nums"
                >
                  {formatarDataHora(e.ocorridoEm)}
                </time>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Detalhes (#{e.id})
                </summary>
                <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-2 font-mono">
                  {JSON.stringify({ entidadeId: e.entidadeId, ...(e.dados as object) }, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ol>
      )}
      {t.proxima !== undefined && (
        <Link
          href={`/auditoria?${proxima.toString()}`}
          className="w-fit text-sm font-medium underline underline-offset-4"
        >
          Mais antigos
        </Link>
      )}
    </div>
  )
}
