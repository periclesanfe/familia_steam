import { describe, expect, it } from 'vitest'

import { type DadosAta, gerarAta } from './ata'
import { chaveObjeto, efeitoCombina, efeitoSchema } from './efeitos'
import { sha256hex } from './hash'
import { apurarVotacao } from './quorum'

const U = '123e4567-e89b-12d3-a456-426614174000'

describe('efeitos (RN-VOT-01/08/09)', () => {
  it('efeito combina com o assunto', () => {
    expect(efeitoCombina('VETO_JOGO', { tipo: 'VETO_JOGO', avisoId: U })).toBe(true)
    expect(efeitoCombina('VETO_JOGO', { tipo: 'NENHUM' })).toBe(false)
    expect(efeitoCombina('CASO_OMISSO', { tipo: 'INVALIDAR_PAGAMENTO', pagamentoId: U })).toBe(true)
    expect(efeitoCombina('CASO_OMISSO', { tipo: 'VETO_JOGO', avisoId: U })).toBe(false)
    expect(efeitoCombina('OUTRO', { tipo: 'NENHUM' })).toBe(true)
    expect(efeitoCombina('OUTRO', { tipo: 'CANCELAR_OBRIGACAO', obrigacaoId: U })).toBe(false)
  })

  it('chaveObjeto por assunto e efeito', () => {
    expect(chaveObjeto({ tipo: 'VETO_JOGO', avisoId: U }, 'v')).toBe(`aviso:${U}`)
    expect(chaveObjeto({ tipo: 'EXCLUSAO_BLOQUEIO', numero: 3 }, 'v')).toBe('bloqueio:3')
    expect(chaveObjeto({ tipo: 'INVALIDAR_PAGAMENTO', pagamentoId: U }, 'v')).toBe(
      `INVALIDAR_PAGAMENTO:${U}`,
    )
    expect(chaveObjeto({ tipo: 'NENHUM' }, 'v1')).toBe('votacao:v1')
  })

  it('efeito com parâmetro inválido é recusado pelo schema', () => {
    expect(
      efeitoSchema.safeParse({
        tipo: 'CRIAR_DEVOLUCAO',
        devedorId: U,
        credorId: U,
        valorCentavos: -1,
        rodadaId: U,
      }).success,
    ).toBe(false)
    expect(efeitoSchema.safeParse({ tipo: 'DESCONHECIDO' }).success).toBe(false)
  })
})

describe('apuração: cenários (RN-VOT-02/04)', () => {
  const base = {
    status: 'ABERTA' as const,
    encerraEm: new Date('2026-10-07T12:00:00Z'),
    impedidosIds: [] as string[],
  }
  const todos = new Set(['a', 'b', 'c', 'd', 'e'])
  const v = (pessoaId: string, opcao: 'FAVOR' | 'CONTRA' | 'ABSTENCAO', h: number) => ({
    pessoaId,
    opcao,
    votadoEm: new Date(Date.UTC(2026, 9, 5, h)),
  })

  it('CA-73: 2 a favor, 2 contra e 1 abstenção → REJEITADA por impossibilidade no último voto', () => {
    const votos = [v('a', 'FAVOR', 1), v('b', 'FAVOR', 2), v('c', 'CONTRA', 3), v('d', 'CONTRA', 4)]
    const vot = { ...base, eleitoresIds: [...todos], quorum: 3 }
    expect(apurarVotacao(vot, votos, new Date(Date.UTC(2026, 9, 5, 4)), todos)).toEqual({
      status: 'ABERTA',
    })
    expect(
      apurarVotacao(
        vot,
        [...votos, v('e', 'ABSTENCAO', 5)],
        new Date(Date.UTC(2026, 9, 5, 5)),
        todos,
      ),
    ).toMatchObject({
      status: 'REJEITADA',
      motivo: 'APROVACAO_IMPOSSIVEL',
    })
  })

  it('CA-74: 2 a favor e mais nada → REJEITADA em abertaEm + 48 h exatos', () => {
    const vot = { ...base, eleitoresIds: [...todos], quorum: 3 }
    const r = apurarVotacao(vot, [v('a', 'FAVOR', 1), v('b', 'FAVOR', 2)], base.encerraEm, todos)
    expect(r).toEqual({ status: 'REJEITADA', motivo: 'PRAZO', encerradaEm: base.encerraEm })
  })

  it('CA-76: eleitor pendente sai → a impossibilidade é reavaliada na hora', () => {
    const vot = { ...base, eleitoresIds: [...todos], quorum: 3 }
    const votos = [v('a', 'FAVOR', 1), v('b', 'CONTRA', 2), v('c', 'CONTRA', 3)]
    expect(apurarVotacao(vot, votos, new Date(Date.UTC(2026, 9, 5, 4)), todos)).toEqual({
      status: 'ABERTA',
    })
    const semD = new Set(['a', 'b', 'c', 'e'])
    expect(apurarVotacao(vot, votos, new Date(Date.UTC(2026, 9, 5, 4)), semD)).toMatchObject({
      motivo: 'APROVACAO_IMPOSSIVEL',
    })
  })

  it('CA-80: alvo do art. 30 é impedido — n=5, quórum 3, 4 eleitores aptos', () => {
    const vot = { ...base, eleitoresIds: [...todos], impedidosIds: ['e'], quorum: 3 }
    const votos = [v('a', 'FAVOR', 1), v('b', 'CONTRA', 2), v('c', 'CONTRA', 3)]
    expect(apurarVotacao(vot, votos, new Date(Date.UTC(2026, 9, 5, 4)), todos)).toMatchObject({
      motivo: 'APROVACAO_IMPOSSIVEL',
    })
  })
})

describe('ATA (RN-VOT-06)', () => {
  const dados: DadosAta = {
    numero: 4,
    data: '2026-10-07',
    convocante: 'Ana',
    assunto: 'VETO_JOGO',
    efeito: { tipo: 'VETO_JOGO', avisoId: U },
    descricaoEfeito: 'vetar Hades II',
    proposicao: 'Vetar o jogo Hades II',
    justificativa: 'Já temos na família',
    votos: [
      { nome: 'Ana', opcao: 'FAVOR' },
      { nome: 'Bruno', opcao: 'FAVOR' },
      { nome: 'Caio', opcao: 'FAVOR' },
      { nome: 'Duda', opcao: 'CONTRA' },
    ],
    naoVotaram: ['Edu'],
    impedidos: [],
    aprovada: true,
    motivo: 'QUORUM_ATINGIDO',
    abertaEm: '05/10/2026 às 18:02',
    encerradaEm: '06/10/2026 às 09:00',
    n: 5,
    quorum: 3,
    versao: '1.0',
    resultadoDoEfeito: 'aplicado: entrada nº 02 no Anexo I',
  }

  it('CA-87: campos do Anexo II + extras; o sha256 é do markdown', () => {
    const md = gerarAta(dados)
    expect(md).toContain('# ATA Nº 4, de 07/10/2026')
    expect(md).toContain('**Convocada por:** Ana')
    expect(md).toContain('- (x) Veto de jogo (art. 23)')
    expect(md).toContain('- ( ) Caso omisso (art. 43)')
    expect(md).toContain('| A favor | 3 | Ana, Bruno, Caio |')
    expect(md).toContain('| Abstenções | 0 | — |')
    expect(md).toContain('(x) Aprovado   ( ) Rejeitado')
    expect(md).toContain('Não votaram: Edu.')
    expect(sha256hex(md)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('assunto sem checkbox próprio sai como Outro com artigo; admissão com inclusão marca as duas', () => {
    const md = gerarAta({
      ...dados,
      assunto: 'ADMISSAO_MEMBRO',
      efeito: {
        tipo: 'ADMISSAO_MEMBRO',
        nome: 'Fulano',
        steamId64: '76561197960287999',
        incluirNaFamilia: true,
      },
      aprovada: false,
      motivo: 'PRAZO',
    })
    expect(md).toContain('- (x) Outro: Admissão de membro (art. 6º)')
    expect(md).toContain('- (x) Inclusão ou remoção de integrante da FAMÍLIA STEAM (arts. 7º e 35)')
    expect(md).toContain('( ) Aprovado   (x) Rejeitado')
  })
})
