import { formatarBRL } from '@/domain/dinheiro'
import { cn } from '@/lib/utils'

// 07 §6.2 / 12 UI-07: centavos → "R$ 1.234,56", algarismos tabulares.
export function Dinheiro({ centavos, className }: { centavos: number; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatarBRL(centavos)}</span>
}
