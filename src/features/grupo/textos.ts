// 07 §5: textos prontos para o GRUPO. Funções puras, sem chave Pix, com link absoluto.
import { formatarBRL } from '@/domain/dinheiro'
import { formatarDataHora } from '@/lib/formato'

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

export const nomeDoMes = (mesReferencia: string): string => {
  const [a, m] = mesReferencia.split('-').map(Number) as [number, number]
  return `${MESES[m - 1] ?? ''}/${String(a)}`
}

export function textoDoSorteio(e: {
  mesReferencia: string
  cicloNumero: number
  sequencia: number
  corteEm: Date
  concorreram: string[]
  contemplado: string | null
  motivoSemContemplado: string | null
  hash: string
  contribuicaoCentavos: number | null
  vencimentoEm: Date | null
  link: string
}): string {
  const linhas = [
    `🎲 Sorteio de ${nomeDoMes(e.mesReferencia)} (ciclo ${String(e.cicloNumero)}, rodada ${String(e.sequencia)}) — ${formatarDataHora(e.corteEm)}`,
    `Concorreram: ${e.concorreram.length > 0 ? e.concorreram.join(', ') : 'ninguém'}`,
  ]
  if (e.contemplado) {
    linhas.push(
      `Contemplado: ${e.contemplado} 🎉  (hash ${e.hash.slice(0, 4)}…${e.hash.slice(-3)})`,
    )
    if (e.contribuicaoCentavos && e.vencimentoEm) {
      linhas.push(
        `Pagamento: ${formatarBRL(e.contribuicaoCentavos)} para ${e.contemplado} até ${formatarDataHora(new Date(e.vencimentoEm.getTime() - 60_000))} (ou justifique para ganhar 7 dias)`,
      )
    }
  } else {
    linhas.push(`Sem contemplado neste mês (${e.motivoSemContemplado ?? '—'}).`)
  }
  linhas.push(`Detalhes: ${e.link}`)
  return linhas.join('\n')
}
