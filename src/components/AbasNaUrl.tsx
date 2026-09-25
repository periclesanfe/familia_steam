import type { Route } from 'next'
import Link from 'next/link'

import { cn } from '@/lib/utils'

// 12 UI-10: abas são navegação por ?aba= (link compartilhável), não estado do cliente.
export function AbasNaUrl<T extends string>({
  abas,
  ativa,
  base,
}: {
  abas: { id: string; rotulo: string }[]
  ativa: string
  base: Route<T>
}) {
  return (
    <nav aria-label="Seções" className="inline-flex w-fit gap-1 rounded-lg bg-muted p-1">
      {abas.map((a) => (
        <Link
          key={a.id}
          href={`${base}?aba=${a.id}` as Route}
          aria-current={a.id === ativa ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1 text-sm font-medium transition-colors duration-150',
            a.id === ativa
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  )
}
