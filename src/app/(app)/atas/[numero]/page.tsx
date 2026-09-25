import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Markdown } from '@/components/Markdown'
import { ataPorNumero } from '@/features/votacoes/consultas'
import { formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'ATA' }

// 07 §3.8: renderização fiel ao Anexo II a partir do markdown imutável, pronta para imprimir.
// ponytail: EX_COM_PENDENCIA vê só as ATAs que o citam — entra com o M8a (saídas)
export default async function AtaPage({ params }: PageProps<'/atas/[numero]'>) {
  await paginaExige(['MEMBRO'])
  const { numero } = await params
  const ata = await ataPorNumero(Number(numero))
  if (!ata) notFound()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 print:max-w-none print:p-0">
      <h1 className="sr-only">ATA nº {ata.numero}</h1>
      <Markdown texto={ata.markdown} />
      <p className="text-xs text-muted-foreground">
        Gerada em {formatarDataHora(ata.geradaEm)} · sha256{' '}
        <span className="font-mono break-all">{ata.sha256}</span>
      </p>
      <Link
        href={`/votacoes/${ata.votacaoId}`}
        className="w-fit text-sm underline underline-offset-4 print:hidden"
      >
        Ver a votação
      </Link>
    </div>
  )
}
