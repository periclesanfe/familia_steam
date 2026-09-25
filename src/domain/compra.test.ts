import { describe, expect, it } from 'vitest'

import {
  type AppLoja,
  bloqueia,
  classificarAquisicao,
  type EntradaValidacao,
  exige16IV,
  type FatosAviso,
  type FatosCompra,
  podeConvocarVeto,
  statusAviso,
  validarProduto,
} from './compra'
import { complementar, conservaRodada, gasto, premio, ratear, sobra } from './financeiro'
import { instanteLocal, somarHoras } from './tempo'

const JOGO: NonNullable<AppLoja> = {
  tipo: 'game',
  gratuito: false,
  nome: 'Hades II',
  categorias: [2, 62],
  descritores: [],
  jogoBaseAppId: null,
  emBreve: false,
}
const agora = instanteLocal('2026-10-05', '20:00')

const entrada = (e: Partial<EntradaValidacao> = {}): EntradaValidacao => ({
  produto: { tipo: 'JOGO', appId: 100, appIdsIncluidos: [], nome: 'Hades II' },
  loja: new Map([[100, JOGO]]),
  bloqueados: new Set(),
  desbloqueadosAdulto: new Set(),
  bibliotecaContemplado: new Set(),
  outros: [{ apelido: 'Bia', biblioteca: new Set() }],
  janelaVetoAte: somarHoras(agora, 48),
  prazoCompraAte: instanteLocal('2026-11-03'),
  agora,
  ...e,
})
const regra = (vs: ReturnType<typeof validarProduto>, r: string) => vs.find((x) => x.regra === r)

describe('validações do produto (RN-COM-04)', () => {
  it('produto limpo: nenhum bloqueio; V5 sempre pede declaração', () => {
    const vs = validarProduto(entrada())
    expect(bloqueia(vs)).toBe(false)
    expect(regra(vs, 'V5')).toMatchObject({ resultado: 'ALERTA', exige: 'DECLARACAO' })
    expect(regra(vs, 'V6')?.resultado).toBe('OK')
  })

  it('CA-59: jogo no Anexo I / pacote que o contém → bloqueio; DLC do jogo bloqueado → alerta', () => {
    expect(regra(validarProduto(entrada({ bloqueados: new Set([100]) })), 'V1')?.resultado).toBe(
      'BLOQUEIO',
    )
    const pacote = entrada({
      produto: { tipo: 'PACOTE', appId: 200, appIdsIncluidos: [200, 100], nome: 'Pacote' },
      loja: new Map([
        [200, JOGO],
        [100, JOGO],
      ]),
      bloqueados: new Set([100]),
    })
    expect(regra(validarProduto(pacote), 'V1')?.resultado).toBe('BLOQUEIO')
    const dlc = entrada({
      produto: { tipo: 'DLC', appId: 300, appIdsIncluidos: [], nome: 'Expansão' },
      loja: new Map([[300, { ...JOGO, tipo: 'dlc', jogoBaseAppId: 100 }]]),
      bloqueados: new Set([100]),
    })
    const vs = validarProduto(dlc)
    expect(regra(vs, 'V2')?.resultado).toBe('ALERTA')
    expect(regra(vs, 'V1')?.resultado).toBe('OK')
  })

  it('CA-60: sem categoria 62 → alerta com declaração e evidência; falha de rede → DESCONHECIDO (não bloqueia)', () => {
    const sem62 = validarProduto(entrada({ loja: new Map([[100, { ...JOGO, categorias: [2] }]]) }))
    expect(regra(sem62, 'V6')).toMatchObject({
      resultado: 'ALERTA',
      exige: 'DECLARACAO_E_EVIDENCIA',
    })
    const falha = validarProduto(entrada({ loja: new Map([[100, null]]) }))
    expect(regra(falha, 'V6')?.resultado).toBe('DESCONHECIDO')
    expect(bloqueia(falha)).toBe(false)
  })

  it('CA-61: descritor 3 → bloqueio (salvo desbloqueio por ATA); descritor 1 → alerta + declaração', () => {
    const adulto = entrada({ loja: new Map([[100, { ...JOGO, descritores: [3] }]]) })
    expect(regra(validarProduto(adulto), 'V3')?.resultado).toBe('BLOQUEIO')
    expect(
      regra(validarProduto({ ...adulto, desbloqueadosAdulto: new Set([100]) }), 'V3')?.resultado,
    ).toBe('OK')
    const nudez = validarProduto(entrada({ loja: new Map([[100, { ...JOGO, descritores: [1] }]]) }))
    expect(regra(nudez, 'V4')).toMatchObject({ resultado: 'ALERTA', exige: 'DECLARACAO' })
  })

  it('CA-62: o contemplado já possui → bloqueio; perfil privado → DESCONHECIDO', () => {
    expect(
      regra(validarProduto(entrada({ bibliotecaContemplado: new Set([100]) })), 'V9')?.resultado,
    ).toBe('BLOQUEIO')
    expect(regra(validarProduto(entrada({ bibliotecaContemplado: null })), 'V9')?.resultado).toBe(
      'DESCONHECIDO',
    )
  })

  it('CA-63 (V10): outro membro possui → exige 16 IV; biblioteca privada → não verificável', () => {
    const vs = validarProduto(entrada({ outros: [{ apelido: 'Bia', biblioteca: new Set([100]) }] }))
    expect(regra(vs, 'V10')?.mensagem).toContain('Bia')
    expect(exige16IV(vs, [])).toBe(true)
    const privado = validarProduto(entrada({ outros: [{ apelido: 'Bia', biblioteca: null }] }))
    expect(regra(privado, 'V10')?.mensagem).toContain('Não verificável para Bia')
    expect(exige16IV(privado, [])).toBe(false)
    expect(exige16IV(privado, ['bia'])).toBe(true) // "eu tenho este jogo"
  })

  it('CA-70: F2P → bloqueio; music → alerta + declaração; DLC "1000 Coins" → alerta (V8)', () => {
    expect(
      regra(validarProduto(entrada({ loja: new Map([[100, { ...JOGO, gratuito: true }]]) })), 'V7')
        ?.resultado,
    ).toBe('BLOQUEIO')
    expect(
      regra(validarProduto(entrada({ loja: new Map([[100, { ...JOGO, tipo: 'music' }]]) })), 'V7')
        ?.resultado,
    ).toBe('ALERTA')
    const moedas = entrada({
      produto: { tipo: 'DLC', appId: 300, appIdsIncluidos: [], nome: '1000 Coins' },
      loja: new Map([[300, { ...JOGO, tipo: 'dlc', nome: '1000 Coins' }]]),
    })
    expect(regra(validarProduto(moedas), 'V8')?.resultado).toBe('ALERTA')
  })

  it('V11 e V12: janela depois do prazo, menos de 96 h e pré-venda', () => {
    const tarde = validarProduto(entrada({ prazoCompraAte: somarHoras(agora, 24) }))
    expect(regra(tarde, 'V11')?.mensagem).toContain('depois do prazo')
    expect(
      regra(validarProduto(entrada({ loja: new Map([[100, { ...JOGO, emBreve: true }]]) })), 'V12')
        ?.resultado,
    ).toBe('ALERTA')
  })
})

describe('status do aviso (RN-COM-05)', () => {
  const aviso = (f: Partial<FatosAviso> = {}): FatosAviso => ({
    substituidoEm: null,
    janelaVetoAte: somarHoras(agora, 48),
    prazoCompraAte: instanteLocal('2026-11-03'),
    aquisicoesAtivas: 0,
    veto: null,
    votacoes16IV: [],
    exige16IV: false,
    ...f,
  })

  it('CA-54: aviso sexta 20:00; veto domingo 19:59:59 aceito, 20:00:00 recusado', () => {
    const sexta = instanteLocal('2026-10-02', '20:00')
    const janela = somarHoras(sexta, 48)
    expect(podeConvocarVeto(janela, new Date(janela.getTime() - 1000))).toBe(true)
    expect(podeConvocarVeto(janela, janela)).toBe(false)
    expect(statusAviso(aviso({ janelaVetoAte: janela }), janela)).toEqual({
      status: 'AUTORIZADO',
      autorizadoEm: janela,
    })
  })

  it('janela aberta, veto aberto, veto aprovado (CA-55) e veto rejeitado (CA-56)', () => {
    expect(statusAviso(aviso(), agora).status).toBe('JANELA_VETO')
    const aberto = aviso({ veto: { status: 'ABERTA', encerradaEm: null } })
    expect(statusAviso(aberto, agora).status).toBe('EM_VOTACAO_VETO')
    expect(
      statusAviso(aviso({ veto: { status: 'APROVADA', encerradaEm: agora } }), agora).status,
    ).toBe('VETADO')
    const fim = somarHoras(agora, 5)
    expect(statusAviso(aviso({ veto: { status: 'REJEITADA', encerradaEm: fim } }), fim)).toEqual({
      status: 'AUTORIZADO',
      autorizadoEm: fim,
    })
  })

  it('CA-63: com 16 IV exigida → AGUARDANDO_16IV; aprovada → AUTORIZADO; rejeitada → NAO_AUTORIZADO_16IV', () => {
    const depois = somarHoras(agora, 49)
    expect(statusAviso(aviso({ exige16IV: true }), depois).status).toBe('AGUARDANDO_16IV')
    const aprovada = aviso({
      exige16IV: true,
      votacoes16IV: [{ status: 'APROVADA', encerradaEm: somarHoras(agora, 60) }],
    })
    expect(statusAviso(aprovada, somarHoras(agora, 61))).toEqual({
      status: 'AUTORIZADO',
      autorizadoEm: somarHoras(agora, 60),
    })
    const rejeitada = aviso({
      exige16IV: true,
      votacoes16IV: [{ status: 'REJEITADA', encerradaEm: depois }],
    })
    expect(statusAviso(rejeitada, depois).status).toBe('NAO_AUTORIZADO_16IV')
  })

  it('utilizado, substituído (CA-64) e expirado (CA-65)', () => {
    expect(statusAviso(aviso({ aquisicoesAtivas: 1 }), agora).status).toBe('UTILIZADO')
    expect(statusAviso(aviso({ substituidoEm: agora }), agora).status).toBe('SUBSTITUIDO')
    expect(statusAviso(aviso(), instanteLocal('2026-11-03')).status).toBe('EXPIRADO')
  })
})

describe('irregularidades da compra (RN-COM-09)', () => {
  const compra = (f: Partial<FatosCompra> = {}): FatosCompra => ({
    compradaEm: somarHoras(agora, 10),
    prazoCompraAte: instanteLocal('2026-11-03'),
    aviso: {
      appId: 100,
      appIdsIncluidos: [],
      autorizadoEm: somarHoras(agora, 48),
      status: 'JANELA_VETO',
      exige16IV: false,
      aprovado16IV: false,
    },
    appId: 100,
    vetoAberto: false,
    cessaoEmVotacao: false,
    bloqueadoNoAnexoI: false,
    outrasAtivas: 0,
    multiplasPermitidas: false,
    contaSteamId64: '76561197960287930',
    steamIdContemplado: '76561197960287930',
    ...f,
  })

  it('CA-57: 10 h depois do aviso, sem veto → ANTES_DA_AUTORIZACAO', () => {
    expect(classificarAquisicao(compra())).toEqual(['ANTES_DA_AUTORIZACAO'])
  })

  it('CA-58: com veto aberto → ANTES_DA_AUTORIZACAO e DURANTE_VOTACAO_VETO', () => {
    expect(classificarAquisicao(compra({ vetoAberto: true }))).toEqual([
      'ANTES_DA_AUTORIZACAO',
      'DURANTE_VOTACAO_VETO',
    ])
  })

  it('regular depois da autorização; CA-68 segunda aquisição; conta, produto e prazo', () => {
    const regular = compra({ compradaEm: somarHoras(agora, 50) })
    expect(classificarAquisicao(regular)).toEqual([])
    expect(classificarAquisicao({ ...regular, outrasAtivas: 1 })).toEqual(['SEGUNDA_AQUISICAO'])
    expect(
      classificarAquisicao({ ...regular, outrasAtivas: 1, multiplasPermitidas: true }),
    ).toEqual([])
    expect(classificarAquisicao({ ...regular, contaSteamId64: '76561197960287999' })).toEqual([
      'CONTA_DIFERENTE_DO_CONTEMPLADO',
    ])
    expect(classificarAquisicao({ ...regular, appId: 999 })).toEqual(['PRODUTO_DIFERENTE_DO_AVISO'])
    expect(
      classificarAquisicao({ ...regular, compradaEm: instanteLocal('2026-11-03', '10:00') }),
    ).toEqual(['APOS_PRAZO'])
    expect(classificarAquisicao({ ...regular, aviso: null })).toEqual(['SEM_AVISO'])
  })
})

describe('prêmio, gasto, SOBRA e rateio (RN-FIN-11..18)', () => {
  const r = { contribuicaoCentavos: 2500, pagantesNoCorte: 5 }

  it('CA-25/26/27/28: prêmio 12500; gasto 8990 → sobra 3510; gasto 14000 → complementação', () => {
    expect(premio(r, [])).toBe(12500)
    expect(sobra(12500, gasto([{ valorCentavos: 8990, reembolsoValorCentavos: null }]))).toBe(3510)
    expect(sobra(12500, 10000)).toBe(2500) // CA-27: nominal, mesmo com D sem pagar
    expect(sobra(12500, 14000)).toBe(0) // CA-28
    expect(premio(r, [{ valorCentavos: 3510, canceladaEm: null }])).toBe(16010) // prêmio seguinte (CA-26)
    expect(premio(r, [{ valorCentavos: 3510, canceladaEm: agora }])).toBe(12500)
  })

  it('CA-32: 703 entre 5 → 141, 141, 141, 140, 140', () => {
    expect(ratear(703, ['A', 'B', 'C', 'D', 'E']).map((x) => x.centavos)).toEqual([
      141, 141, 141, 140, 140,
    ])
    expect(ratear(3, ['A', 'B', 'C', 'D', 'E']).filter((x) => x.centavos > 0)).toHaveLength(3)
  })

  it('CA-160: 2 × 6000 com sobra 500 paga; dois reembolsos integrais → complementares 6000 + 6000', () => {
    const premioR = 12500
    const primeira = complementar({
      premioCentavos: premioR,
      gastoNovoCentavos: 6000,
      sobraCentavos: 500,
      outrasComplementares: 0,
    })
    expect(primeira).toBe(6000)
    const segunda = complementar({
      premioCentavos: premioR,
      gastoNovoCentavos: 0,
      sobraCentavos: 500,
      outrasComplementares: 6000,
    })
    expect(segunda).toBe(6000)
    expect(
      conservaRodada({
        premioCentavos: premioR,
        gastoCentavos: 0,
        sobraCentavos: 500,
        complementares: 12000,
      }),
    ).toBe(true)
  })

  it('reembolso reduz o gasto', () => {
    expect(
      gasto([
        { valorCentavos: 8990, reembolsoValorCentavos: 8990 },
        { valorCentavos: 5000, reembolsoValorCentavos: 1000 },
      ]),
    ).toBe(4000)
  })
})
