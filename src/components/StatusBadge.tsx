import { CircleAlert, CircleCheck, CircleSlash, Clock, TriangleAlert } from 'lucide-react'

import type { Tom } from '@/lib/rotulos'
import { cn } from '@/lib/utils'

// 12 UI-03: tom com ícone e texto, nunca só cor.
const TONS: Record<Tom, { classe: string; Icone: typeof Clock }> = {
  neutro: { classe: 'bg-secondary text-secondary-foreground', Icone: Clock },
  sucesso: { classe: 'bg-success/10 text-success dark:bg-success/20', Icone: CircleCheck },
  atencao: { classe: 'bg-warning/10 text-warning dark:bg-warning/20', Icone: TriangleAlert },
  perigo: {
    classe: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
    Icone: CircleAlert,
  },
  inativo: { classe: 'border border-border text-muted-foreground', Icone: CircleSlash },
}

export function StatusBadge({ rotulo, tom }: { rotulo: string; tom: Tom }) {
  const { classe, Icone } = TONS[tom]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
        classe,
      )}
    >
      <Icone className="size-3.5" aria-hidden />
      {rotulo}
    </span>
  )
}
