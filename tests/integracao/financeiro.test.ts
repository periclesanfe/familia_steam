import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instanteLocal } from '@/domain/tempo'
import { anexoParaDownload } from '@/features/financeiro/anexos'
import {
  justificarObrigacao,
  mudarPagamento,
  registrarPagamento,
} from '@/features/financeiro/servico'
import { executarRodada } from '@/features/rodadas/servico'
import { salvarAnexo } from '@/server/anexos'
import { perfilDe } from '@/server/auth/perfil'
import { emTransacao } from '@/server/tx'

import { dono, limpar } from './banco'
import { ctxDe, prepararCiclo1 } from './fabricas'

const jpeg = (n = 1) =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, n])], 'c.jpg', { type: 'image/jpeg' })

/** Ciclo 1 com a rodada 1 sorteada em 03/10 12:00; devolve ids e o contemplado. */
async function comRodada1() {
  const ids = await prepararCiclo1()
  vi.setSystemTime(instanteLocal('2026-10-03', '12:00'))
  const r1 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
  await executarRodada(r1.id, null, () => 0)
  const rodada = await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })
  const credor = rodada.contempladoId ?? ''
  const devedores = ids.filter((id) => id !== credor)
  const obrigacaoDe = (devedorId: string) =>
    dono.obrigacao.findFirstOrThrow({ where: { rodadaId: r1.id, devedorId } })
  return { ids, credor, devedores, obrigacaoDe, rodadaId: r1.id }
}

const agora = () => new Date()

describe('pagamentos (RN-FIN-03..06, RN-ACE-09)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-36: registrado pelo credor nasce CONFIRMADO; por terceiro, DECLARADO', async () => {
    const { credor, devedores, obrigacaoDe } = await comRodada1()
    const [a = '', b = '', c = ''] = devedores
    vi.setSystemTime(instanteLocal('2026-10-03', '18:00'))
    const oa = await obrigacaoDe(a)
    const anexoCredor = await emTransacao((tx) =>
      salvarAnexo(tx, ctxDe(credor, agora()), 'COMPROVANTE_PIX', jpeg(1)),
    )
    const r1 = await registrarPagamento(ctxDe(credor, agora()), {
      obrigacaoId: oa.id,
      valor: 2500,
      pixEm: instanteLocal('2026-10-03', '17:00'),
      anexoId: anexoCredor.id,
    })
    expect((await dono.pagamento.findUniqueOrThrow({ where: { id: r1.pagamentoId } })).status).toBe(
      'CONFIRMADO',
    )

    const ob = await obrigacaoDe(b)
    const anexoTerceiro = await emTransacao((tx) =>
      salvarAnexo(tx, ctxDe(c, agora()), 'COMPROVANTE_PIX', jpeg(2)),
    )
    const r2 = await registrarPagamento(ctxDe(c, agora()), {
      obrigacaoId: ob.id,
      valor: 2500,
      pixEm: instanteLocal('2026-10-03', '17:00'),
      anexoId: anexoTerceiro.id,
    })
    const p2 = await dono.pagamento.findUniqueOrThrow({ where: { id: r2.pagamentoId } })
    expect(p2).toMatchObject({
      status: 'DECLARADO',
      recebedorId: credor,
      chavePixDestinoMascarada: expect.stringMatching(/^\*{4}/) as unknown,
    })
    expect(await dono.anexo.findUniqueOrThrow({ where: { id: anexoTerceiro.id } })).toMatchObject({
      entidade: 'pagamento',
      entidadeId: p2.id,
    })
  })

  it('CA-38: 3000 numa obrigação com saldo 2500 é recusado; parcial é aceito', async () => {
    const { credor, devedores, obrigacaoDe } = await comRodada1()
    const [a = ''] = devedores
    const o = await obrigacaoDe(a)
    const ctx = ctxDe(a, agora())
    // forma diversa só conta CONFIRMADA (RN-FIN-06): o parcial é registrado pelo credor
    await expect(
      registrarPagamento(ctx, {
        obrigacaoId: o.id,
        valor: 3000,
        pixEm: agora(),
        formaDiversa: 'on',
      }),
    ).rejects.toMatchObject({ codigo: 'VALOR_ACIMA_DO_SALDO' })
    await registrarPagamento(ctxDe(credor, agora()), {
      obrigacaoId: o.id,
      valor: 1000,
      pixEm: agora(),
      formaDiversa: 'on',
    })
    await expect(
      registrarPagamento(ctx, {
        obrigacaoId: o.id,
        valor: 1600,
        pixEm: agora(),
        formaDiversa: 'on',
      }),
    ).rejects.toMatchObject({ codigo: 'VALOR_ACIMA_DO_SALDO' })
  })

  it('CA-34 e CA-35: mesmo comprovante em dois pagamentos do mesmo par; hash repetido em outro par gera alerta', async () => {
    const { credor, devedores, obrigacaoDe, rodadaId } = await comRodada1()
    const [a = '', b = ''] = devedores
    const oa = await obrigacaoDe(a)
    // uma 2ª obrigação do mesmo par (no M7 será a SOBRA)
    const sobra = await dono.obrigacao.create({
      data: {
        tipo: 'SOBRA',
        rodadaId,
        devedorId: a,
        credorId: credor,
        valorCentavos: 3510,
        vencimentoEm: oa.vencimentoEm,
        criadaEm: agora(),
      },
    })
    const anexo = await emTransacao((tx) =>
      salvarAnexo(tx, ctxDe(a, agora()), 'COMPROVANTE_PIX', jpeg(7)),
    )
    await registrarPagamento(ctxDe(a, agora()), {
      obrigacaoId: oa.id,
      valor: 2500,
      pixEm: agora(),
      anexoId: anexo.id,
    })
    const segundo = await registrarPagamento(ctxDe(a, agora()), {
      obrigacaoId: sobra.id,
      valor: 3510,
      pixEm: agora(),
      anexoId: anexo.id,
    })
    expect(segundo.alertas).toEqual([])
    expect(await dono.pagamento.count({ where: { comprovanteId: anexo.id } })).toBe(2)

    // B envia o mesmo arquivo (mesmo hash) para a obrigação dele: aceito, com alerta
    const copia = await emTransacao((tx) =>
      salvarAnexo(tx, ctxDe(b, agora()), 'COMPROVANTE_PIX', jpeg(7)),
    )
    const ob = await obrigacaoDe(b)
    const r = await registrarPagamento(ctxDe(b, agora()), {
      obrigacaoId: ob.id,
      valor: 2500,
      pixEm: agora(),
      anexoId: copia.id,
    })
    expect(r.alertas).toEqual(['Este comprovante já foi usado num pagamento entre outras pessoas.'])
  })

  it('CA-123: action com anexo enviado por outra pessoa é recusada; download alheio para PENDENTE é 404', async () => {
    const { devedores, obrigacaoDe } = await comRodada1()
    const [a = '', b = ''] = devedores
    const anexoDeB = await emTransacao((tx) =>
      salvarAnexo(tx, ctxDe(b, agora()), 'COMPROVANTE_PIX', jpeg(3)),
    )
    const oa = await obrigacaoDe(a)
    await expect(
      registrarPagamento(ctxDe(a, agora()), {
        obrigacaoId: oa.id,
        valor: 2500,
        pixEm: agora(),
        anexoId: anexoDeB.id,
      }),
    ).rejects.toMatchObject({ codigo: 'SEM_PERMISSAO' })

    // anexo solto de B: só B baixa; um membro qualquer não
    const perfilA = await perfilDe(a)
    const perfilB = await perfilDe(b)
    if (!perfilA || !perfilB) throw new Error('perfis')
    expect(await anexoParaDownload(anexoDeB.id, perfilA)).toBeNull()
    expect((await anexoParaDownload(anexoDeB.id, perfilB))?.mime).toBe('image/jpeg')
    const pendente = { ...perfilA, perfil: 'PENDENTE' as const }
    await registrarPagamento(ctxDe(b, agora()), {
      obrigacaoId: (await obrigacaoDe(b)).id,
      valor: 2500,
      pixEm: agora(),
      anexoId: anexoDeB.id,
    })
    expect(await anexoParaDownload(anexoDeB.id, pendente)).toBeNull()
    expect(await anexoParaDownload(anexoDeB.id, perfilA)).not.toBeNull() // vinculado: membro vê (art. 40)
  })

  it('CA-121 e CA-19: terceiro não cancela; recebedor contesta (continua contando); devedor cancela → INVALIDADO', async () => {
    const { credor, devedores, obrigacaoDe } = await comRodada1()
    const [a = '', b = ''] = devedores
    const oa = await obrigacaoDe(a)
    vi.setSystemTime(instanteLocal('2026-10-03', '18:00')) // o Pix das 15:00 já aconteceu
    const anexo = await emTransacao((tx) =>
      salvarAnexo(tx, ctxDe(b, agora()), 'COMPROVANTE_PIX', jpeg(4)),
    )
    const { pagamentoId } = await registrarPagamento(ctxDe(b, agora()), {
      obrigacaoId: oa.id,
      valor: 2500,
      pixEm: instanteLocal('2026-10-03', '15:00'),
      anexoId: anexo.id,
    })
    await expect(
      mudarPagamento(ctxDe(b, agora()), { pagamentoId }, 'CANCELAR'),
    ).rejects.toMatchObject({ codigo: 'SEM_PERMISSAO' })
    await expect(
      mudarPagamento(ctxDe(a, agora()), { pagamentoId }, 'CONFIRMAR'),
    ).rejects.toMatchObject({ codigo: 'SEM_PERMISSAO' })
    await mudarPagamento(
      ctxDe(credor, agora()),
      { pagamentoId, motivo: 'NAO_RECEBIDO' },
      'CONTESTAR',
    )
    expect((await dono.pagamento.findUniqueOrThrow({ where: { id: pagamentoId } })).status).toBe(
      'CONTESTADO',
    )

    // CA-19: contestado ainda conta para "em dia" no sorteio seguinte
    vi.setSystemTime(instanteLocal('2026-11-03', '12:00'))
    const r2 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 2 } })
    await executarRodada(r2.id, null, () => 0)
    const s = await dono.sorteio.findFirstOrThrow({ where: { rodadaId: r2.id } })
    const linhaA = (
      s.snapshot as { participantes: { pessoaId: string; emDia: boolean }[] }
    ).participantes.find((p) => p.pessoaId === a)
    expect(linhaA?.emDia).toBe(true)

    await mudarPagamento(ctxDe(a, agora()), { pagamentoId }, 'CANCELAR')
    expect((await dono.pagamento.findUniqueOrThrow({ where: { id: pagamentoId } })).status).toBe(
      'INVALIDADO',
    )
    await expect(
      mudarPagamento(ctxDe(credor, agora()), { pagamentoId }, 'RETIRAR_CONTESTACAO'),
    ).rejects.toMatchObject({
      codigo: 'PAGAMENTO_EM_ESTADO_INVALIDO',
    })
  })

  it('CA-16: justificativa às 23:50 do dia 3 vale; às 00:10 do dia 4 é recusada', async () => {
    const { devedores, obrigacaoDe } = await comRodada1()
    const [a = '', b = ''] = devedores
    vi.setSystemTime(instanteLocal('2026-10-03', '23:50'))
    await justificarObrigacao(ctxDe(a, agora()), {
      obrigacaoId: (await obrigacaoDe(a)).id,
      texto: 'recebo no dia 5',
    })
    expect((await obrigacaoDe(a)).justificadaEm).toEqual(instanteLocal('2026-10-03', '23:50'))
    vi.setSystemTime(instanteLocal('2026-10-04', '00:10'))
    await expect(
      justificarObrigacao(ctxDe(b, agora()), {
        obrigacaoId: (await obrigacaoDe(b)).id,
        texto: 'recebo no dia 5',
      }),
    ).rejects.toMatchObject({ codigo: 'JUSTIFICATIVA_FORA_DO_PRAZO' })
  })
})
