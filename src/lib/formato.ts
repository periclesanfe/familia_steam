// 12 UI-08: datas no fuso de negócio, iguais no servidor e no cliente.
const FUSO = 'America/Sao_Paulo'

const dataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const data = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC', // DataCivil: sem fuso (C-DATA)
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export const formatarDataHora = (t: Date): string => dataHora.format(t).replace(',', ' às')
export const formatarDataCivil = (d: string): string => data.format(new Date(`${d}T00:00:00Z`))
