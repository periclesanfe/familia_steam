// 15 §6 (M10c): cruza sorteios e janelas de compra com os eventos de promoção. Funções puras.
import { type DataCivil, somarDiasCorridos } from './tempo'

export type EventoPromocao = { id: string; nome: string; inicio: DataCivil; fim: DataCivil }

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/** Dia `diaSorteio` dos próximos `meses` meses; o do mês corrente entra se ainda não passou. */
export function sorteiosPrevistos(hoje: DataCivil, diaSorteio: number, meses: number): DataCivil[] {
  const [a = 0, m = 1] = hoje.split('-').map(Number)
  const datas: DataCivil[] = []
  for (let i = 0; datas.length < meses; i++) {
    const total = m - 1 + i
    const data = `${String(a + Math.floor(total / 12))}-${doisDigitos((total % 12) + 1)}-${doisDigitos(diaSorteio)}`
    if (data >= hoje) datas.push(data)
  }
  return datas
}

const sobrepoe = (ini: DataCivil, fim: DataCivil, e: EventoPromocao) =>
  e.inicio <= fim && e.fim >= ini

/**
 * Para cada sorteio, a janela de compra (do sorteio até `diasPrazo` dias depois, art. 20) e os
 * eventos que caem nela; `noDia` marca o evento que já está rolando no dia do sorteio.
 */
export function cruzarJanelas(
  sorteios: readonly DataCivil[],
  diasPrazo: number,
  eventos: readonly EventoPromocao[],
) {
  return sorteios.map((sorteio) => {
    const fimCompra = somarDiasCorridos(sorteio, diasPrazo)
    return {
      sorteio,
      fimCompra,
      eventos: eventos
        .filter((e) => sobrepoe(sorteio, fimCompra, e))
        .map((e) => ({ ...e, noDia: e.inicio <= sorteio && e.fim >= sorteio })),
    }
  })
}
