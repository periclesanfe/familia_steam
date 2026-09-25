import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sha256hex } from '@/domain/hash'
import { PARAMETROS_1_0 } from '@/domain/regulamento'
import { instanteLocal, somarHoras } from '@/domain/tempo'
import { registrarPagamento } from '@/features/financeiro/servico'
import { executarRodada } from '@/features/rodadas/servico'
import {
  cancelarVotacao,
  convocar,
  fecharVotacoesVencidas,
  votar,
} from '@/features/votacoes/servico'

import { dono, limpar } from './banco'
import { ctxDe, prepararCiclo1 } from './fabricas'

const agora = () => new Date()
const nenhum = (ctxPessoa: string, proposicao = 'Registrar a decisão do grupo sobre X') =>
  convocar(ctxDe(ctxPessoa, agora()), {
    assunto: 'OUTRO',
    proposicao,
    justificativa: 'Decisão tomada no GRUPO',
    efeito: { tipo: 'NENHUM' },
  })

describe('votações e ATAs (RN-VOT-01..07)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(instanteLocal('2026-10-05', '18:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-89: convocar antes da vigência é bloqueado', async () => {
    const ids = await prepararCiclo1()
    await dono.versaoRegulamento.updateMany({ data: { vigenteDesde: null } })
    await expect(nenhum(ids[0] ?? '')).rejects.toMatchObject({ codigo: 'REGULAMENTO_NAO_VIGENTE' })
  })

  it('CA-72 e CA-87: aprovada no 3º voto; o 4º é recusado; ATA com não votantes, hash e imutável', async () => {
    const [a = '', b = '', c = '', d = ''] = await prepararCiclo1()
    const { votacaoId } = await nenhum(a)
    const v = await dono.votacao.findUniqueOrThrow({ where: { id: votacaoId } })
    expect([v.n, v.quorum]).toEqual([5, 3])
    expect(v.encerraEm).toEqual(somarHoras(v.abertaEm, 48))
    for (const x of [a, b, c]) {
      vi.setSystemTime(new Date(agora().getTime() + 60_000))

      await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
    }
    await expect(votar(ctxDe(d, agora()), { votacaoId, opcao: 'CONTRA' })).rejects.toMatchObject({
      codigo: 'VOTACAO_ENCERRADA',
    })
    const fim = await dono.votacao.findUniqueOrThrow({
      where: { id: votacaoId },
      include: { ata: true },
    })
    expect(fim).toMatchObject({ status: 'APROVADA', motivoEncerramento: 'QUORUM_ATINGIDO' })
    const ata = fim.ata
    if (!ata) throw new Error('sem ATA')
    expect(ata.numero).toBe(1)
    expect(ata.sha256).toBe(sha256hex(ata.markdown))
    expect(ata.markdown).toContain('| A favor | 3 |')
    expect(ata.markdown).toMatch(/Não votaram: \w+ Silva, \w+ Silva\./)
    await expect(dono.$executeRaw`UPDATE ata SET markdown = 'x'`).rejects.toThrow()
  })

  it('CA-74: sem quórum até o prazo → tick rejeita em abertaEm + 48 h; voto em +48 h é recusado', async () => {
    const [a = '', b = '', c = ''] = await prepararCiclo1()
    const { votacaoId } = await nenhum(a)
    await votar(ctxDe(a, agora()), { votacaoId, opcao: 'FAVOR' })
    await votar(ctxDe(b, agora()), { votacaoId, opcao: 'FAVOR' })
    const v = await dono.votacao.findUniqueOrThrow({ where: { id: votacaoId } })
    vi.setSystemTime(v.encerraEm)
    await expect(votar(ctxDe(c, agora()), { votacaoId, opcao: 'FAVOR' })).rejects.toMatchObject({
      codigo: 'VOTACAO_ENCERRADA',
    })
    const fim = await dono.votacao.findUniqueOrThrow({ where: { id: votacaoId } })
    expect(fim).toMatchObject({
      status: 'REJEITADA',
      motivoEncerramento: 'PRAZO',
      encerradaEm: v.encerraEm,
    })
    expect(await dono.ata.count()).toBe(1)
    expect((await fecharVotacoesVencidas()).encerradas).toBe(0) // idempotente
  })

  it('CA-77: duas votações decididas ao mesmo tempo → ATAs consecutivas, sem lacuna', async () => {
    const [a = '', b = '', c = ''] = await prepararCiclo1()
    const v1 = await nenhum(a, 'Primeira decisão do grupo')
    const v2 = await nenhum(b, 'Segunda decisão do grupo')
    for (const x of [a, b]) {
      await votar(ctxDe(x, agora()), { votacaoId: v1.votacaoId, opcao: 'FAVOR' })

      await votar(ctxDe(x, agora()), { votacaoId: v2.votacaoId, opcao: 'FAVOR' })
    }
    await Promise.all([
      votar(ctxDe(c, agora()), { votacaoId: v1.votacaoId, opcao: 'FAVOR' }),
      votar(ctxDe(c, agora()), { votacaoId: v2.votacaoId, opcao: 'FAVOR' }),
    ])
    const atas = await dono.ata.findMany({ orderBy: { numero: 'asc' } })
    expect(atas.map((x) => x.numero)).toEqual([1, 2])
  })

  it('CA-78 e CA-79: cancelamento só antes do voto de outro; duplicata aberta é recusada', async () => {
    const [a = '', b = ''] = await prepararCiclo1()
    const excluir = () =>
      convocar(ctxDe(a, agora()), {
        assunto: 'CASO_OMISSO',
        proposicao: 'Cancelar a obrigação lançada por engano',
        justificativa: 'Erro de lançamento',
        efeito: { tipo: 'CANCELAR_OBRIGACAO', obrigacaoId: '123e4567-e89b-12d3-a456-426614174000' },
      })
    await expect(excluir()).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO' })
    const { votacaoId } = await nenhum(a)
    await votar(ctxDe(b, agora()), { votacaoId, opcao: 'CONTRA' })
    await expect(cancelarVotacao(ctxDe(a, agora()), { votacaoId })).rejects.toMatchObject({
      codigo: 'CANCELAMENTO_NEGADO',
    })

    // mesmo objeto aberto duas vezes (CA-79): exclusão da mesma entrada do Anexo I
    await dono.jogoBloqueado.create({
      data: { numero: 2, tipo: 'JOGO', nome: 'Jogo X', appIds: [10], motivo: 'teste' },
    })
    const exclusao = () =>
      convocar(ctxDe(a, agora()), {
        assunto: 'EXCLUSAO_BLOQUEIO',
        proposicao: 'Excluir o Jogo X do Anexo I',
        justificativa: 'O veto perdeu o sentido',
        efeito: { tipo: 'EXCLUSAO_BLOQUEIO', numero: 2 },
      })
    await exclusao()
    await expect(exclusao()).rejects.toMatchObject({ codigo: 'VOTACAO_DUPLICADA' })
  })

  it('CA-81: exclusão da entrada 01 é recusada, com orientação sobre o art. 17', async () => {
    const [a = ''] = await prepararCiclo1()
    await expect(
      convocar(ctxDe(a, agora()), {
        assunto: 'EXCLUSAO_BLOQUEIO',
        proposicao: 'Excluir a categoria do Anexo I',
        justificativa: 'Teste',
        efeito: { tipo: 'EXCLUSAO_BLOQUEIO', numero: 1 },
      }),
    ).rejects.toMatchObject({ codigo: 'ENTRADA_INVALIDA', artigo: 'art. 17' })
  })

  it('CA-84 e CA-85: uma alteração do Regulamento por vez; a votação segue a versão da convocação', async () => {
    const [a = '', b = '', c = ''] = await prepararCiclo1()
    const texto = `# Regulamento 1.1\n\n${'Texto novo. '.repeat(20)}`
    const alterar = (horas: number) =>
      convocar(ctxDe(a, agora()), {
        assunto: 'ALTERACAO_REGULAMENTO',
        proposicao: 'Aprovar a versão 1.1',
        justificativa: 'Ajustes de redação',
        efeito: {
          tipo: 'ALTERACAO_REGULAMENTO',
          texto,
          resumo: 'Votação passa a durar mais',
          parametros: { ...PARAMETROS_1_0, horasVotacao: horas },
          excluirEntradas: [],
        },
      })
    const { votacaoId } = await alterar(72)
    await expect(alterar(96)).rejects.toMatchObject({ codigo: 'VOTACAO_DUPLICADA' })
    for (const x of [a, b, c]) {
      await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
    }
    const v11 = await dono.versaoRegulamento.findUniqueOrThrow({ where: { ordem: 1 } })
    expect(v11).toMatchObject({ numero: '1.1', ataNumero: 1 })
    expect(v11.vigenteDesde).toEqual(instanteLocal('2026-11-01'))
    // antes de 01/11, nova votação ainda dura 48 h (versão 1.0); depois, 72 h
    const { votacaoId: v2 } = await nenhum(b, 'Decisão sob a versão 1.0')
    const x = await dono.votacao.findUniqueOrThrow({ where: { id: v2 } })
    expect(x.encerraEm).toEqual(somarHoras(x.abertaEm, 48))
    vi.setSystemTime(instanteLocal('2026-11-02', '10:00'))
    const { votacaoId: v3 } = await nenhum(b, 'Decisão sob a versão 1.1')
    const y = await dono.votacao.findUniqueOrThrow({ where: { id: v3 } })
    expect(y.encerraEm).toEqual(somarHoras(y.abertaEm, 72))
  })

  it('CA-19: INVALIDAR_PAGAMENTO aprovado → devedor em atraso desde o vencimento original', async () => {
    const ids = await prepararCiclo1()
    const [a = '', b = '', c = ''] = ids
    vi.setSystemTime(instanteLocal('2026-10-03', '12:00'))
    const r1 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
    await executarRodada(r1.id, null, () => 0)
    const contemplado =
      (await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).contempladoId ?? ''
    const devedor = ids.find((x) => x !== contemplado) ?? ''
    const o = await dono.obrigacao.findFirstOrThrow({
      where: { rodadaId: r1.id, devedorId: devedor },
    })
    vi.setSystemTime(instanteLocal('2026-10-03', '18:00'))
    const { pagamentoId } = await registrarPagamento(ctxDe(devedor, agora()), {
      obrigacaoId: o.id,
      valor: 2500,
      pixEm: instanteLocal('2026-10-03', '17:00'),
      formaDiversa: 'on',
    })
    await dono.pagamento.update({ where: { id: pagamentoId }, data: { status: 'CONTESTADO' } })
    vi.setSystemTime(instanteLocal('2026-10-10', '10:00'))
    const { votacaoId } = await convocar(ctxDe(a, agora()), {
      assunto: 'CASO_OMISSO',
      proposicao: 'Invalidar o pagamento contestado',
      justificativa: 'O credor não recebeu',
      efeito: { tipo: 'INVALIDAR_PAGAMENTO', pagamentoId },
    })
    for (const x of [a, b, c]) {
      await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
    }
    const p = await dono.pagamento.findUniqueOrThrow({ where: { id: pagamentoId } })
    expect(p).toMatchObject({ status: 'INVALIDADO', ataNumero: 1 })
    const ata = await dono.ata.findFirstOrThrow()
    expect(ata.markdown).toContain('- (x) Caso omisso (art. 43)')
    expect(ata.markdown).toContain('Efeito: aplicado: pagamento invalidado.')
  })
})
