import { describe, expect, it } from 'vitest'

import {
  type ContribuicaoFato,
  emAtraso,
  recebedores,
  saldo,
  situacao,
  vencimentoEfetivo,
} from './financeiro'
import { fimDoDia, instanteLocal } from './tempo'

const base: ContribuicaoFato = {
  id: 'o1',
  devedorId: 'c',
  cicloId: 'c1',
  valorCentavos: 2500,
  vencimentoEm: fimDoDia('2026-10-03'),
  justificadaEm: null,
  canceladaEm: null,
  autoquitada: false,
  diasProrrogacao: 7,
  pagamentos: [],
}
const pix = (valorCentavos: number, dia: string, hora = '10:00') => ({
  status: 'DECLARADO' as const,
  formaDiversa: false,
  valorCentavos,
  pixEm: instanteLocal(dia, hora),
})

describe('financeiro (RN-FIN-03/08)', () => {
  it('CA-33: 1000 no dia 3 e 1500 no dia 6 sem justificativa → em atraso; quitada em atraso no dia 6', () => {
    const o = { ...base, pagamentos: [pix(1000, '2026-10-03'), pix(1500, '2026-10-06')] }
    expect(emAtraso(o, instanteLocal('2026-10-04'))).toBe(true)
    expect(saldo(o, o.pagamentos)).toBe(0)
    expect(situacao(o, instanteLocal('2026-10-07'))).toBe('QUITADA_EM_ATRASO')
    const soPrimeiro = { ...o, pagamentos: [pix(1000, '2026-10-03')] }
    expect(situacao(soPrimeiro, instanteLocal('2026-10-05'))).toBe('EM_ATRASO')
  })

  it('CA-16: justificada 23:50 do dia 3 vence em 10/10 23:59 e fica prorrogada', () => {
    const o = { ...base, justificadaEm: instanteLocal('2026-10-03', '23:50') }
    expect(vencimentoEfetivo(o, 7)).toEqual(instanteLocal('2026-10-11'))
    expect(situacao(o, instanteLocal('2026-10-05'))).toBe('PRORROGADA')
    const paga = { ...o, pagamentos: [pix(2500, '2026-10-09')] }
    expect(situacao(paga, instanteLocal('2026-10-20'))).toBe('QUITADA')
  })

  it('no prazo, cancelada e autoquitada', () => {
    expect(situacao(base, instanteLocal('2026-10-03', '15:00'))).toBe('NO_PRAZO')
    expect(
      situacao({ ...base, canceladaEm: instanteLocal('2026-10-05') }, instanteLocal('2026-10-06')),
    ).toBe('CANCELADA')
    expect(situacao({ ...base, autoquitada: true }, instanteLocal('2026-10-06'))).toBe(
      'AUTOQUITADA',
    )
  })

  it('CA-133: obrigação de contemplado persiste sem encargos (saldo constante)', () => {
    const o = { ...base, devedorId: 'contemplado' }
    expect(saldo(o, [])).toBe(2500)
    expect(situacao(o, instanteLocal('2027-06-01'))).toBe('EM_ATRASO')
  })
})

describe('recebedores (RN-FIN-04)', () => {
  const t = (h: string) => instanteLocal('2026-10-03', h)
  const contrib = { tipo: 'CONTRIBUICAO', devedorId: 'e', credorId: 'c', criadaEm: t('12:00') }
  const cessoes = [
    { cedenteId: 'b', encerradaEm: t('20:00') },
    { cedenteId: 'a', encerradaEm: t('18:00') },
  ]

  it('default = credor vigente em pixEm (CA-157: Pix a A antes da 1ª aprovação)', () => {
    expect(recebedores(contrib, cessoes, t('12:30'))).toEqual({
      opcoes: ['a', 'b', 'c'],
      padrao: 'a',
    })
    expect(recebedores(contrib, cessoes, t('19:00')).padrao).toBe('b')
    expect(recebedores(contrib, cessoes, t('21:00')).padrao).toBe('c')
  })

  it('descarta o cedente que é o devedor; DEVOLUCAO só tem o credor', () => {
    expect(recebedores({ ...contrib, devedorId: 'a' }, cessoes, t('12:30')).padrao).toBe('b')
    expect(recebedores({ ...contrib, tipo: 'DEVOLUCAO' }, cessoes, t('12:30'))).toEqual({
      opcoes: ['c'],
      padrao: 'c',
    })
  })
})
