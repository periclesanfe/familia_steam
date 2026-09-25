// Tempo de negócio (C-TEMPO, C-DATA, C-DIAS, C-HORAS). Só Intl: sem biblioteca de datas e sem offset fixo.

export const FUSO = 'America/Sao_Paulo'

/** Data civil 'AAAA-MM-DD', sem fuso (C-DATA). */
export type DataCivil = string

const DIA_MS = 86_400_000
const HORA_MS = 3_600_000
const formatadores = new Map<string, Intl.DateTimeFormat>()

function partes(t: number, fuso: string) {
  let f = formatadores.get(fuso)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatadores.set(fuso, f)
  }
  const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, x.value]))
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
    segundo: Number(p.second),
  }
}

/** Relógio de parede em `fuso` lido como se fosse UTC, menos o instante: o offset em ms. */
function offset(t: number, fuso: string): number {
  const p = partes(t, fuso)
  return (
    Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - Math.floor(t / 1000) * 1000
  )
}

function dividir(d: DataCivil): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) throw new RangeError(`DataCivil inválida: ${d}`)
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(a, mes - 1, dia))
  if (t.getUTCMonth() !== mes - 1) throw new RangeError(`DataCivil inválida: ${d}`)
  return [a, mes, dia]
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')
const civilDeUtc = (t: Date): DataCivil => t.toISOString().slice(0, 10)

/** Data civil de um instante no fuso de negócio. */
export function dataLocal(t: Date, fuso = FUSO): DataCivil {
  const p = partes(t.getTime(), fuso)
  return `${String(p.ano)}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}`
}

/**
 * Instante em que o relógio de `fuso` marca `data hora`. Numa lacuna de horário de verão
 * (a meia-noite não existe no dia da virada), devolve o primeiro instante do dia; numa
 * sobreposição, o primeiro dos dois.
 */
export function instanteLocal(data: DataCivil, hora = '00:00', fuso = FUSO): Date {
  const [a, m, d] = dividir(data)
  const hm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora)
  if (!hm) throw new RangeError(`Hora inválida: ${hora}`)
  const parede = Date.UTC(a, m - 1, d, Number(hm[1]), Number(hm[2]))
  const candidatos = [
    parede - offset(parede - DIA_MS, fuso),
    parede - offset(parede + DIA_MS, fuso),
  ]
  const exatos = candidatos.filter((t) => t + offset(t, fuso) === parede)
  return new Date(exatos.length > 0 ? Math.min(...exatos) : Math.max(...candidatos))
}

/** Fim do dia D = D+1 00:00 local, limite exclusivo (C-TEMPO). */
export const fimDoDia = (d: DataCivil): Date => instanteLocal(somarDiasCorridos(d, 1))

export function somarDiasCorridos(d: DataCivil, n: number): DataCivil {
  const [a, m, dia] = dividir(d)
  return civilDeUtc(new Date(Date.UTC(a, m - 1, dia + n)))
}

/** "N dias corridos contados de D" vence no fim do dia D+N (C-DIAS, D-22). */
export const prazoEmDias = (d: DataCivil, n: number): Date => fimDoDia(somarDiasCorridos(d, n))

/** C-HORAS: N horas exatas. */
export const somarHoras = (t: Date, n: number): Date => new Date(t.getTime() + n * HORA_MS)

/** Mesmo horário de parede, N dias depois (ex.: vencimento prorrogado, RN-FIN-03). */
export function somarDiasAoInstante(t: Date, n: number, fuso = FUSO): Date {
  const p = partes(t.getTime(), fuso)
  return instanteLocal(
    somarDiasCorridos(dataLocal(t, fuso), n),
    `${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`,
    fuso,
  )
}

/** Soma anos civis; 29/02 vira 28/02 (RN-CAD-11). */
export function somarAnos(d: DataCivil, n: number): DataCivil {
  const [a, m, dia] = dividir(d)
  const ultimo = new Date(Date.UTC(a + n, m, 0)).getUTCDate()
  return `${String(a + n)}-${doisDigitos(m)}-${doisDigitos(Math.min(dia, ultimo))}`
}

/** 00:00 local do dia 1º do mês seguinte à data local de `t` (RN-REG-03, D-20). */
export function inicioDoMesSeguinte(t: Date): Date {
  const [a, m] = dividir(dataLocal(t))
  return instanteLocal(civilDeUtc(new Date(Date.UTC(a, m, 1))))
}

/** Prazo da janela de revisão: `dataInicio` 00:00 local, isto é, o fim do dia anterior (RN-CIC-05). */
export const prazoConfirmacao = (dataInicio: DataCivil): Date => instanteLocal(dataInicio)

/** Campo @db.Date: grava meia-noite UTC da data civil e lê sem fuso (C-DATA). */
export const paraDb = (d: DataCivil): Date => {
  dividir(d)
  return new Date(`${d}T00:00:00Z`)
}
export const deDb = (x: Date): DataCivil => civilDeUtc(x)

/** Duração legível para o `Prazo` (12 UI-15): "2 d 3 h", "3 h 12 min", "45 s". */
export function formatarDuracao(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const [d, h, min] = [Math.floor(s / 86_400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60]
  if (d > 0) return h > 0 ? `${String(d)} d ${String(h)} h` : `${String(d)} d`
  if (h > 0) return min > 0 ? `${String(h)} h ${String(min)} min` : `${String(h)} h`
  if (min > 0) return `${String(min)} min`
  return `${String(s)} s`
}

/** Primeira data com o dia do mês `dia` estritamente depois de `d` (RN-CIC-01: "primeiro dia 3"). */
export function primeiroDiaApos(d: DataCivil, dia: number): DataCivil {
  const [a, m, atual] = dividir(d)
  const mesmoMes = atual < dia
  return civilDeUtc(new Date(Date.UTC(a, mesmoMes ? m - 1 : m, dia)))
}

/** "AAAA-MM" da data civil (Rodada.mesReferencia). */
export const mesDe = (d: DataCivil): string => d.slice(0, 7)
