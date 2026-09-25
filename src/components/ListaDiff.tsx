import type { LinhaDiff } from '@/domain/diff'

export type Trecho = LinhaDiff | { tipo: 'omitidas'; quantidade: number }

const ESTILO = {
  igual: { prefixo: ' ', classe: 'text-muted-foreground', rotulo: '' },
  removida: { prefixo: '−', classe: 'bg-destructive/10 text-destructive', rotulo: 'removida: ' },
  incluida: { prefixo: '+', classe: 'bg-success/10 text-success', rotulo: 'incluída: ' },
} as const

// 07 §3.7: linhas removidas (−) e incluídas (+) com contexto; o resto vira "linhas sem mudança".
// Sem 'use client' e sem dependência de servidor: serve às duas pontas.
export function ListaDiff({
  trechos,
  className = 'max-h-96',
}: {
  trechos: Trecho[]
  className?: string
}) {
  if (trechos.every((t) => t.tipo === 'omitidas' || t.tipo === 'igual')) {
    return <p className="text-sm text-muted-foreground">Nenhuma diferença no texto.</p>
  }
  return (
    <pre
      className={`overflow-auto rounded-lg border font-mono text-xs leading-relaxed ${className}`}
    >
      {trechos.map((t, k) =>
        t.tipo === 'omitidas' ? (
          <div key={k} className="bg-muted/50 px-3 py-1 text-muted-foreground italic">
            … {t.quantidade} linha(s) sem mudança
          </div>
        ) : (
          <div key={k} className={`px-3 whitespace-pre-wrap ${ESTILO[t.tipo].classe}`}>
            <span aria-hidden>{ESTILO[t.tipo].prefixo} </span>
            <span className="sr-only">{ESTILO[t.tipo].rotulo}</span>
            {t.texto}
          </div>
        ),
      )}
    </pre>
  )
}
