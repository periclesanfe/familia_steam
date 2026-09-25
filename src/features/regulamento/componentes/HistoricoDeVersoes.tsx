import Link from 'next/link'

import { dataLocal } from '@/domain/tempo'
import { formatarDataCivil, formatarDataHora } from '@/lib/formato'

// RN-REG-03/04: cada versão com a vigência, o resumo das mudanças e a ATA que a aprovou.
export function HistoricoDeVersoes({
  versoes,
}: {
  versoes: {
    numero: string
    vigenteDesde: Date | null
    aprovadaEm: Date | null
    resumoAlteracoes: string | null
    ataNumero: number | null
  }[]
}) {
  return (
    <ol className="flex flex-col divide-y rounded-lg border text-sm">
      {versoes.map((v) => (
        <li key={v.numero} className="flex flex-col gap-1 px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-medium">Versão {v.numero}</span>
            <span className="text-muted-foreground">
              {v.vigenteDesde
                ? `vigente desde ${formatarDataCivil(dataLocal(v.vigenteDesde))}`
                : 'aguardando a assinatura de todos'}
            </span>
          </div>
          {v.resumoAlteracoes && <p>{v.resumoAlteracoes}</p>}
          {v.ataNumero !== null && (
            <p className="text-xs text-muted-foreground">
              Aprovada {v.aprovadaEm ? `em ${formatarDataHora(v.aprovadaEm)} ` : ''}na{' '}
              <Link href={`/atas/${String(v.ataNumero)}`} className="underline underline-offset-4">
                ATA nº {v.ataNumero}
              </Link>
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}
