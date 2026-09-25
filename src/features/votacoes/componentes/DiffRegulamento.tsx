import { ListaDiff, type Trecho } from '@/components/ListaDiff'
import { dataLocal } from '@/domain/tempo'
import { formatarDataCivil } from '@/lib/formato'

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
      <ListaDiff trechos={trechos} />
    </div>
  )
}
