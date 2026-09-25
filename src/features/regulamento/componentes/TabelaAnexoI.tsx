import { formatarDataCivil, formatarDataHora } from '@/lib/formato'

type Entrada = {
  numero: number
  nome: string
  dataVeto: string | null
  origemTexto: string | null
  motivo: string
  ataInclusaoNumero: number | null
  excluidoEm: Date | null
  ataExclusaoNumero: number | null
}

// 07 §3.9: Nº | Jogo | Data do veto | Motivo | ATA nº | Situação.
export function TabelaAnexoI({ entradas }: { entradas: Entrada[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">Anexo I — Lista de Jogos Bloqueados</caption>
        <thead className="bg-muted/50 text-left">
          <tr>
            {['Nº', 'Jogo', 'Data do veto', 'Motivo', 'ATA nº', 'Situação'].map((c) => (
              <th key={c} scope="col" className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entradas.map((e) => (
            <tr key={e.numero} className="border-t">
              <td className="px-3 py-2 tabular-nums">{String(e.numero).padStart(2, '0')}</td>
              <td className="px-3 py-2">{e.nome}</td>
              <td className="px-3 py-2">
                {e.dataVeto ? formatarDataCivil(e.dataVeto) : (e.origemTexto ?? '—')}
              </td>
              <td className="px-3 py-2">{e.motivo}</td>
              <td className="px-3 py-2 tabular-nums">{e.ataInclusaoNumero ?? '—'}</td>
              <td className="px-3 py-2">
                {e.excluidoEm
                  ? `Excluída em ${formatarDataHora(e.excluidoEm)} (ATA ${String(e.ataExclusaoNumero ?? '—')})`
                  : 'Vigente'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
