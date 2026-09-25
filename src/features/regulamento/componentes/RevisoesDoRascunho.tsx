import { ListaDiff, type Trecho } from '@/components/ListaDiff'
import { formatarDataHora } from '@/lib/formato'

// RN-REG-08: quem mudou o rascunho, quando, o resumo e o diff do texto.
export function RevisoesDoRascunho({
  revisoes,
}: {
  revisoes: {
    id: number
    em: Date
    autor: string
    resumo: string
    assinaturasInvalidadas: number
    trechos: Trecho[]
  }[]
}) {
  if (revisoes.length === 0) {
    return <p className="text-sm text-muted-foreground">Ninguém alterou o texto original ainda.</p>
  }
  return (
    <ol className="flex flex-col gap-2">
      {revisoes.map((r) => (
        <li key={r.id}>
          <details className="rounded-lg border">
            <summary className="cursor-pointer px-3 py-2 text-sm">
              <span className="font-medium">{r.autor}</span>{' '}
              <span className="text-muted-foreground">em {formatarDataHora(r.em)}</span>: {r.resumo}
              {r.assinaturasInvalidadas > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  ({r.assinaturasInvalidadas} assinatura(s) recomeçaram)
                </span>
              )}
            </summary>
            <div className="p-2">
              <ListaDiff trechos={r.trechos} />
            </div>
          </details>
        </li>
      ))}
    </ol>
  )
}
