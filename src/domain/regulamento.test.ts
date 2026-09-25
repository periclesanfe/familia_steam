import { describe, expect, it } from 'vitest'

import {
  adesaoValida,
  codigoAmigo,
  numeroDaVersao,
  PARAMETROS_1_0,
  parametrosSchema,
  versaoVigente,
  vigenciaDeAlteracao,
  dividirRegulamento,
} from './regulamento'
import { instanteLocal } from './tempo'

const v = (ordem: number, vigenteDesde: Date | null) => ({ ordem, vigenteDesde })

describe('regulamento', () => {
  it('CA-82: aprovada 30/09 23:00 vale em 01/10; aprovada 01/10 10:00 vale em 01/11', () => {
    const v10 = v(0, instanteLocal('2026-09-01'))
    const cedo = v(1, vigenciaDeAlteracao(instanteLocal('2026-09-30', '23:00')))
    const tarde = v(1, vigenciaDeAlteracao(instanteLocal('2026-10-01', '10:00')))
    const sorteio = instanteLocal('2026-10-03', '12:00')
    expect(cedo.vigenteDesde).toEqual(instanteLocal('2026-10-01'))
    expect(tarde.vigenteDesde).toEqual(instanteLocal('2026-11-01'))
    expect(versaoVigente([v10, cedo], sorteio)).toBe(cedo)
    expect(versaoVigente([v10, tarde], sorteio)).toBe(v10)
  })

  it('CA-83: duas alterações aprovadas em outubro → em 01/11 vale a de maior ordem', () => {
    const inicio = instanteLocal('2026-11-01')
    const [a, b] = [v(1, inicio), v(2, inicio)]
    expect(versaoVigente([v(0, instanteLocal('2026-09-01')), b, a], inicio)).toBe(b)
  })

  it('CA-149: 1.10 é mais nova que 1.9 (ordem numérica)', () => {
    const t = instanteLocal('2027-06-01')
    const v19 = v(9, instanteLocal('2027-01-01'))
    const v110 = v(10, instanteLocal('2027-02-01'))
    expect(versaoVigente([v110, v19], t)).toBe(v110)
    expect(numeroDaVersao(10)).toBe('1.10')
  })

  it('sem versão vigente antes da adesão (RN-REG-02)', () => {
    expect(versaoVigente([v(0, null)], instanteLocal('2026-10-01'))).toBeNull()
  })

  it('parâmetros da 1.0 validam; chave desconhecida é recusada', () => {
    expect(parametrosSchema.parse(PARAMETROS_1_0)).toEqual(PARAMETROS_1_0)
    expect(parametrosSchema.safeParse({ ...PARAMETROS_1_0, extra: 1 }).success).toBe(false)
    expect(parametrosSchema.safeParse({ ...PARAMETROS_1_0, horaSorteio: '25:00' }).success).toBe(
      false,
    )
  })

  it('adesão vale só para a versão e a conta Steam atuais (RN-ACE-16)', () => {
    const steamId64 = '76561197960287930'
    expect(codigoAmigo(steamId64)).toBe('22202')
    const a = { sha256Versao: 'h1', codigoAmigo: '22202' }
    expect(adesaoValida(a, { sha256: 'h1' }, { steamId64 })).toBe(true)
    expect(adesaoValida(a, { sha256: 'h2' }, { steamId64 })).toBe(false)
    expect(adesaoValida(a, { sha256: 'h1' }, { steamId64: '76561197960287931' })).toBe(false)
  })
})

describe('dividirRegulamento (exibição dos anexos)', () => {
  it('separa o corpo das assinaturas e dos anexos, sem perder texto', () => {
    const texto =
      '# R\n\n## CAPÍTULO I\ntexto\n\n## ASSINATURAS DOS MEMBROS\nassine\n\n## ANEXO I — LISTA\ntabela\n## ANEXO II — ATA\nmodelo\n'
    const { corpo, anexos } = dividirRegulamento(texto)
    expect(corpo).toBe('# R\n\n## CAPÍTULO I\ntexto')
    expect(anexos.map((a) => a.titulo)).toEqual([
      'ASSINATURAS DOS MEMBROS',
      'ANEXO I — LISTA',
      'ANEXO II — ATA',
    ])
    expect(anexos[2]?.markdown).toBe('modelo')
    expect(dividirRegulamento('sem anexos').anexos).toEqual([])
  })
})
