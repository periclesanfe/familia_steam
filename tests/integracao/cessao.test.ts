import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instanteLocal } from '@/domain/tempo'
import { proporCessao, responderCessao, retirarCessao } from '@/features/cessao/servico'
import { premioDaRodada } from '@/features/compra/fechamento'
import { mudarPagamento, registrarPagamento } from '@/features/financeiro/servico'
import { executarRodada } from '@/features/rodadas/servico'
import { convocar, fecharVotacoesVencidas, votar } from '@/features/votacoes/servico'
import { salvarAnexo } from '@/server/anexos'
import { emTransacao } from '@/server/tx'

import { dono, limpar } from './banco'
import { ctxDe, pagarTudo, prepararCiclo1 } from './fabricas'

const agora = () => new Date()
const hora = (h: string, dia = '2026-10-03') => {
  vi.setSystemTime(instanteLocal(dia, h))
}
const jpeg = (n: number) => new File([new Uint8Array([0xff, 0xd8, 0xff, n])], 'c.jpg')

/** Rodada 1 sorteada às 12:00: A é o contemplado; B…E os demais. */
async function sorteada() {
  const ids = await prepararCiclo1()
  hora('12:00')
  const agendada = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
  await executarRodada(agendada.id, null, () => 0)
  const r1 = await dono.rodada.findUniqueOrThrow({ where: { id: agendada.id } })
  const A = r1.contempladoId ?? ''
  const [B = '', C = '', D = '', E = ''] = ids.filter((x) => x !== A)
  return { r1, A, B, C, D, E }
}

const contribuicao = (rodadaId: string, devedorId: string) =>
  dono.obrigacao.findFirstOrThrow({
    where: { rodadaId, devedorId, tipo: 'CONTRIBUICAO', canceladaEm: null },
  })

/** Forma diversa registrada pelo próprio recebedor: nasce CONFIRMADA e conta. */
async function pagar(ator: string, obrigacaoId: string, pixEm = agora(), recebedorId?: string) {
  const { pagamentoId } = await registrarPagamento(ctxDe(ator, agora()), {
    obrigacaoId,
    valor: 2500,
    pixEm,
    formaDiversa: 'on',
    recebedorId,
  })
  return pagamentoId
}

/** Pix com comprovante registrado por quem pagou: DECLARADO (conta). */
async function pagarComComprovante(
  ator: string,
  obrigacaoId: string,
  n: number,
  recebedorId?: string,
) {
  const anexo = await emTransacao((tx) =>
    salvarAnexo(tx, ctxDe(ator, agora()), 'COMPROVANTE_PIX', jpeg(n)),
  )
  const { pagamentoId } = await registrarPagamento(ctxDe(ator, agora()), {
    obrigacaoId,
    valor: 2500,
    pixEm: agora(),
    anexoId: anexo.id,
    recebedorId,
  })
  return pagamentoId
}

async function ceder(rodadaId: string, cedente: string, beneficiario: string, votantes: string[]) {
  const { cessaoId } = await proporCessao(ctxDe(cedente, agora()), {
    rodadaId,
    beneficiarioId: beneficiario,
    cienciaPrazo: false,
  })
  const { votacaoId = '' } = await responderCessao(ctxDe(beneficiario, agora()), {
    cessaoId,
    aceitar: true,
  })
  for (const x of votantes) {
    await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
  }
  return { cessaoId, votacaoId }
}

const derivadaDe = (pagamentoOrigemId: string) =>
  dono.obrigacao.findFirst({ where: { pagamentoOrigemId, canceladaEm: null } })

describe('cessão da vez (RN-CES, RN-FIN-04/05)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-47 e CA-130: repasse dos Pix ao cedente, credor redirecionado, prêmio nominal; A concorre na rodada seguinte', async () => {
    const { r1, A, B, C, D, E } = await sorteada()
    hora('12:30')
    const pC = await pagar(A, (await contribuicao(r1.id, C)).id)
    const pD = await pagar(A, (await contribuicao(r1.id, D)).id)
    hora('13:00')
    const { cessaoId } = await proporCessao(ctxDe(A, agora()), {
      rodadaId: r1.id,
      beneficiarioId: B,
      cienciaPrazo: false,
    })
    const { votacaoId = '' } = await responderCessao(ctxDe(B, agora()), { cessaoId, aceitar: true })
    expect(await dono.votacao.findUniqueOrThrow({ where: { id: votacaoId } })).toMatchObject({
      assunto: 'CESSAO_VEZ',
      convocadaPorId: A,
    })
    hora('18:00')
    for (const x of [C, D, E]) {
      await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
    }
    hora('20:00')
    const pE = await pagar(B, (await contribuicao(r1.id, E)).id)

    const r = await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })
    expect(r.contempladoId).toBe(B)
    expect(r.prazoCompraAte).toEqual(r1.prazoCompraAte) // art. 20: conta do sorteio original
    expect(r1.prazoCompraAte).not.toBeNull()
    expect(await dono.cessao.findUniqueOrThrow({ where: { id: cessaoId } })).toMatchObject({
      status: 'APROVADA',
    })
    const repasses = await dono.obrigacao.findMany({
      where: { tipo: 'REPASSE_CESSAO', canceladaEm: null },
    })
    expect(repasses).toHaveLength(2)
    expect(repasses.every((o) => o.devedorId === A && o.credorId === B)).toBe(true)
    expect(repasses.map((o) => o.pagamentoOrigemId).sort()).toEqual([pC, pD].sort())
    expect(await contribuicao(r1.id, A)).toMatchObject({ credorId: B, autoquitada: false })
    expect(await contribuicao(r1.id, B)).toMatchObject({ credorId: B, autoquitada: true })
    expect(await dono.pagamento.findUniqueOrThrow({ where: { id: pE } })).toMatchObject({
      recebedorId: B,
      status: 'CONFIRMADO',
    })
    expect(await derivadaDe(pE)).toBeNull()
    expect(await emTransacao((tx) => premioDaRodada(tx, r1.id))).toBe(12500)
    const ata = await dono.ata.findFirstOrThrow()
    expect(ata.markdown).toContain('passa a ser o contemplado da rodada')

    // CA-130: com tudo pago, A (cedente) concorre na rodada 2 e B não
    for (const o of repasses) await pagar(B, o.id)
    await pagarTudo(instanteLocal('2026-10-03', '21:00'))
    hora('12:00', '2026-11-03')
    const r2 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 2 } })
    await executarRodada(r2.id, null, () => 0)
    const s = await dono.sorteio.findFirstOrThrow({ where: { rodadaId: r2.id } })
    expect(s.elegiveisIds).toContain(A)
    expect(s.elegiveisIds).not.toContain(B)
  })

  it('CA-48: o que o beneficiário já pagou ao cedente volta como DEVOLUCAO e não entra no repasse', async () => {
    const { r1, A, B, C, D, E } = await sorteada()
    hora('12:30')
    const original = await contribuicao(r1.id, B)
    const pB = await pagar(A, original.id)
    hora('18:00')
    await ceder(r1.id, A, B, [C, D, E])
    expect(await dono.obrigacao.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({
      motivoCancelamento: 'cessao',
    })
    expect(await contribuicao(r1.id, B)).toMatchObject({ credorId: B, autoquitada: true })
    expect(await derivadaDe(pB)).toMatchObject({
      tipo: 'DEVOLUCAO',
      devedorId: A,
      credorId: B,
      valorCentavos: 2500,
    })
    expect(await dono.obrigacao.count({ where: { tipo: 'REPASSE_CESSAO' } })).toBe(0)
  })

  it('CA-155: Pix de B a A feito antes da aprovação e registrado depois → DEVOLUCAO quando passa a contar', async () => {
    const { r1, A, B, C, D, E } = await sorteada()
    const original = await contribuicao(r1.id, B)
    hora('18:00')
    await ceder(r1.id, A, B, [C, D, E])
    hora('19:00')
    const pB = await pagar(B, original.id, instanteLocal('2026-10-03', '12:30'))
    const p = await dono.pagamento.findUniqueOrThrow({ where: { id: pB } })
    expect(p).toMatchObject({ recebedorId: A, status: 'DECLARADO' }) // forma diversa ainda não conta
    expect(await derivadaDe(pB)).toBeNull()
    await mudarPagamento(ctxDe(A, agora()), { pagamentoId: pB }, 'CONFIRMAR')
    expect(await derivadaDe(pB)).toMatchObject({ tipo: 'DEVOLUCAO', devedorId: A, credorId: B })
    // Pix posterior ao cancelamento não se registra na obrigação cancelada
    await expect(pagar(B, original.id, agora())).rejects.toMatchObject({
      codigo: 'ENTRADA_INVALIDA',
    })
  })

  it('CA-52, CA-53 e CA-157: Pix ao cedente depois da aprovação gera repasse; em A→B→C vai direto a C', async () => {
    const { r1, A, B, C, D, E } = await sorteada()
    hora('18:00')
    await ceder(r1.id, A, B, [C, D, E])
    hora('19:00')
    const pC = await pagarComComprovante(C, (await contribuicao(r1.id, C)).id, 1, A) // CA-52
    expect(await derivadaDe(pC)).toMatchObject({
      tipo: 'REPASSE_CESSAO',
      devedorId: A,
      credorId: B,
    })
    hora('21:00')
    await ceder(r1.id, B, C, [A, D, E]) // CA-53: o cessionário cede de novo
    expect(await dono.ata.count()).toBe(2)
    expect((await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).contempladoId).toBe(C)
    expect(await derivadaDe(pC)).toMatchObject({ devedorId: A, credorId: C }) // redirecionado
    // CA-157: Pix de D a A às 12:30, registrado só agora → REPASSE A→C, nunca A→B
    hora('22:00')
    const pD = await pagar(
      A,
      (await contribuicao(r1.id, D)).id,
      instanteLocal('2026-10-03', '12:30'),
    )
    expect(await dono.pagamento.findUniqueOrThrow({ where: { id: pD } })).toMatchObject({
      recebedorId: A,
    })
    expect(await derivadaDe(pD)).toMatchObject({
      tipo: 'REPASSE_CESSAO',
      devedorId: A,
      credorId: C,
    })
  })

  it('CA-153: A→B com repasse pago e depois B→A → repasse cancelado, DEVOLUCAO B→A, ninguém deve a si mesmo', async () => {
    const { r1, A, B, C, D, E } = await sorteada()
    hora('12:30')
    const pC = await pagar(A, (await contribuicao(r1.id, C)).id)
    hora('18:00')
    await ceder(r1.id, A, B, [C, D, E])
    const repasse = await derivadaDe(pC)
    hora('19:00')
    const pA = await pagar(B, repasse?.id ?? '')
    hora('20:00')
    await ceder(r1.id, B, A, [C, D, E])
    expect(
      await dono.obrigacao.findUniqueOrThrow({ where: { id: repasse?.id ?? '' } }),
    ).toMatchObject({ motivoCancelamento: 'cessao' })
    expect(await derivadaDe(pA)).toMatchObject({ tipo: 'DEVOLUCAO', devedorId: B, credorId: A })
    const vivas = await dono.obrigacao.findMany({ where: { canceladaEm: null } })
    expect(vivas.filter((o) => o.devedorId === o.credorId).every((o) => o.autoquitada)).toBe(true)
    expect(await contribuicao(r1.id, A)).toMatchObject({ credorId: A, autoquitada: true })
    expect(await dono.ata.count()).toBe(2)
  })

  it('CA-158: invalidação por ATA desfaz a cadeia de repasses A→B→C com DEVOLUCAO C→B e B→A', async () => {
    const { r1, A, B, C, D, E } = await sorteada()
    hora('12:30')
    const p1 = await pagar(A, (await contribuicao(r1.id, D)).id)
    hora('18:00')
    await ceder(r1.id, A, B, [C, D, E])
    hora('18:30')
    const p2 = await pagar(B, (await derivadaDe(p1))?.id ?? '')
    hora('20:00')
    await ceder(r1.id, B, C, [A, D, E])
    const repasseP2 = await derivadaDe(p2)
    expect(repasseP2).toMatchObject({ tipo: 'REPASSE_CESSAO', devedorId: B, credorId: C })
    hora('20:30')
    const p3 = await pagar(C, repasseP2?.id ?? '')

    hora('10:00', '2026-10-04')
    const { votacaoId } = await convocar(ctxDe(E, agora()), {
      assunto: 'CASO_OMISSO',
      proposicao: 'Invalidar o Pix de D',
      justificativa: 'O Pix não existiu',
      efeito: { tipo: 'INVALIDAR_PAGAMENTO', pagamentoId: p1 },
    })
    for (const x of [A, D, E]) {
      await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
    }
    const canceladas = await dono.obrigacao.findMany({
      where: { motivoCancelamento: 'pagamento_invalidado' },
    })
    expect(canceladas.map((o) => o.pagamentoOrigemId).sort()).toEqual([p1, p2].sort())
    expect(await derivadaDe(p3)).toMatchObject({ tipo: 'DEVOLUCAO', devedorId: C, credorId: B })
    expect(await derivadaDe(p2)).toMatchObject({ tipo: 'DEVOLUCAO', devedorId: B, credorId: A })
  })

  it('CA-159: B cancela o próprio Pix que originou a DEVOLUCAO A→B → a devolução é cancelada', async () => {
    const { r1, A, B, C, D, E } = await sorteada()
    hora('12:30')
    const pB = await pagarComComprovante(B, (await contribuicao(r1.id, B)).id, 2)
    hora('18:00')
    await ceder(r1.id, A, B, [C, D, E])
    const devolucao = await derivadaDe(pB)
    expect(devolucao).toMatchObject({ tipo: 'DEVOLUCAO', devedorId: A, credorId: B })
    await mudarPagamento(ctxDe(B, agora()), { pagamentoId: pB }, 'CANCELAR')
    expect(
      await dono.obrigacao.findUniqueOrThrow({ where: { id: devolucao?.id ?? '' } }),
    ).toMatchObject({ motivoCancelamento: 'pagamento_invalidado' })
  })

  it('CA-49: ninguém vota → REJEITADA em +48 h; nada muda', async () => {
    const { r1, A, B } = await sorteada()
    hora('13:00')
    const { cessaoId } = await proporCessao(ctxDe(A, agora()), {
      rodadaId: r1.id,
      beneficiarioId: B,
      cienciaPrazo: false,
    })
    await responderCessao(ctxDe(B, agora()), { cessaoId, aceitar: true })
    hora('13:01', '2026-10-05')
    await fecharVotacoesVencidas()
    expect((await dono.cessao.findUniqueOrThrow({ where: { id: cessaoId } })).status).toBe(
      'REJEITADA',
    )
    expect((await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).contempladoId).toBe(A)
    expect(await contribuicao(r1.id, B)).toMatchObject({ credorId: A, autoquitada: false })
  })

  it('CA-50, CA-51 e RN-CES-03: bloqueios da proposta, recusa e retirada mesmo com votos', async () => {
    const { r1, A, B, C, D } = await sorteada()
    hora('13:00')
    const propor = (ator: string, beneficiarioId: string) =>
      proporCessao(ctxDe(ator, agora()), { rodadaId: r1.id, beneficiarioId, cienciaPrazo: false })
    await expect(propor(B, C)).rejects.toMatchObject({ codigo: 'SEM_PERMISSAO' })

    const { cessaoId: recusada } = await propor(A, B)
    await expect(propor(A, C)).rejects.toMatchObject({ codigo: 'ENTRADA_INVALIDA' }) // outra aberta
    await responderCessao(ctxDe(B, agora()), { cessaoId: recusada, aceitar: false })
    expect((await dono.cessao.findUniqueOrThrow({ where: { id: recusada } })).status).toBe(
      'CANCELADA',
    )

    const { cessaoId } = await propor(A, B)
    const { votacaoId = '' } = await responderCessao(ctxDe(B, agora()), { cessaoId, aceitar: true })
    await votar(ctxDe(C, agora()), { votacaoId, opcao: 'FAVOR' })
    await retirarCessao(ctxDe(A, agora()), { cessaoId })
    expect((await dono.cessao.findUniqueOrThrow({ where: { id: cessaoId } })).status).toBe(
      'CANCELADA',
    )
    expect((await dono.votacao.findUniqueOrThrow({ where: { id: votacaoId } })).status).toBe(
      'CANCELADA',
    )
    expect(await dono.ata.count()).toBe(0)

    await dono.membro.updateMany({ where: { pessoaId: C }, data: { status: 'IMPOSSIBILITADO' } })
    await expect(propor(A, C)).rejects.toMatchObject({ codigo: 'ENTRADA_INVALIDA' }) // CA-51
    await dono.rodada.update({
      where: { id: r1.id },
      data: { tipoContemplacao: 'OBRIGATORIA_ART14' },
    })
    await expect(propor(A, D)).rejects.toMatchObject({ codigo: 'ENTRADA_INVALIDA' }) // CA-50
  })
})
