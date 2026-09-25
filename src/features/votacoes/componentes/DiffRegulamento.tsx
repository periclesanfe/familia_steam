import type { LinhaDiff } from '@/domain/diff'
import { dataLocal } from '@/domain/tempo'
import { formatarDataCivil } from '@/lib/formato'

type Trecho = LinhaDiff | { tipo: 'omitidas'; quantidade: number }

const ESTILO = {
  igual: { prefixo: ' ', classe: 'text-muted-foreground', rotulo: '' },
  removida: { prefixo: '−', classe: 'bg-destructive/10 text-destructive', rotulo: 'removida: ' },
  incluida: { prefixo: '+', classe: 'bg-success/10 text-success', rotulo: 'incluída: ' },
} as const

// 07 §3.7: o texto proposto contra a versão vigente, parâmetros alterados e a vigência (RN-REG-03).
export function DiffRegulamento({
  trechos,
  parametros,
  vigenteDesde,
}: {
  trechos: Trecho[]
  parametros: { nome: string; antes: string; depois: string }[]
  vigenteDesde: Date
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        Se aprovada, a nova versão vale a partir de{' '}
        <span className="font-medium">{formatarDataCivil(dataLocal(vigenteDesde))}</span> (dia 1º do
        mês seguinte ao encerramento).
      </p>
      {parametros.length > 0 && (
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Parâmetros alterados</caption>
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1 font-medium">
                Parâmetro
              </th>
              <th scope="col" className="py-1 font-medium">
                Vigente
              </th>
              <th scope="col" className="py-1 font-medium">
                Proposto
              </th>
            </tr>
          </thead>
          <tbody>
            {parametros.map((p) => (
              <tr key={p.nome} className="border-t">
                <td className="py-1 font-mono">{p.nome}</td>
                <td className="py-1 tabular-nums">{p.antes}</td>
                <td className="py-1 font-medium tabular-nums">{p.depois}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <pre className="max-h-96 overflow-auto rounded-lg border font-mono text-xs leading-relaxed">
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
    </div>
  )
}
