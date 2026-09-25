import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instanteLocal } from '@/domain/tempo'
import { processarFechamentos } from '@/features/compra/fechamento'
import {
  avisar,
  concluirAquisicao,
  fatosDoAviso,
  registrarCompra,
  registrarReembolso,
} from '@/features/compra/servico'
import { executarRodada } from '@/features/rodadas/servico'
import { convocar, votar } from '@/features/votacoes/servico'
import { salvarAnexo } from '@/server/anexos'
import { emTransacao } from '@/server/tx'

import { dono, limpar } from './banco'
import { ctxDe, pagarTudo, prepararCiclo1 } from './fabricas'

const HADES = 1145350
const OUTRO = 413150
const agora = () => new Date()
const hora = (dia: string, h = '12:00') => {
  vi.setSystemTime(instanteLocal(dia, h))
}
const jpeg = (n: number) => new File([new Uint8Array([0xff, 0xd8, 0xff, n])], 'c.jpg')

/** Cache da loja recente: o aviso não chama a Steam (RN-STM-10). */
async function lojaEmCache() {
  // bibliotecas públicas (vazias): V9/V10 verificáveis, sem exigir evidência
  await dono.pessoa.updateMany({ data: { steamJogosPublicos: true } })
  await dono.steamApp.createMany({
    data: [HADES, OUTRO].map((appId) => ({
      appId,
      nome: appId === HADES ? 'Hades II' : 'Stardew Valley',
      tipo: 'game',
      gratuito: false,
      categorias: [2, 62],
      descritoresConteudo: [],
      sucesso: true,
      detalhesEm: new Date('2030-01-01'),
      precoEm: new Date('2030-01-01'),
    })),
  })
}

/** Ciclo 1 com a rodada 1 sorteada em 03/10 12:00 (contemplado = menor id). */
async function comContemplado() {
  const ids = await prepararCiclo1()
  await lojaEmCache()
  hora('2026-10-03')
  const r1 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 1 } })
  await executarRodada(r1.id, null, () => 0)
  await pagarTudo(instanteLocal('2026-10-03', '18:00'))
  const rodada = await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })
  const c = rodada.contempladoId ?? ''
  const steam = (await dono.pessoa.findUniqueOrThrow({ where: { id: c } })).steamId64 ?? ''
  const outros = ids.filter((x) => x !== c)
  return { ids, c, steam, outros, r1: rodada }
}

const avisarHades = (c: string, rodadaId: string, appId = HADES) =>
  avisar(ctxDe(c, agora()), {
    rodadaId,
    appId,
    tipo: 'JOGO',
    origem: 'LOJA_STEAM',
    appIdsIncluidos: [],
    nome: appId === HADES ? 'Hades II' : 'Stardew Valley',
    declaracoes: { V5: 'Não é pornográfico', V9: 'Não possuo', V10: 'Ninguém possui' },
  })

async function comprar(
  c: string,
  steam: string,
  rodadaId: string,
  avisoId: string | undefined,
  valorCentavos: number,
) {
  const anexo = await emTransacao((tx) =>
    salvarAnexo(tx, ctxDe(c, agora()), 'COMPROVANTE_COMPRA', jpeg(valorCentavos % 200)),
  )
  return registrarCompra(ctxDe(c, agora()), {
    rodadaId,
    avisoId,
    appId: HADES,
    nome: 'Hades II',
    compradaEm: agora(),
    valorCentavos,
    comprovanteId: anexo.id,
    contaSteamId64: steam,
    preVenda: false,
  })
}

describe('jogo do mês (RN-COM, RN-FIN-13/14)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-69 e CA-57: compra antes do sorteio recusada; 10 h depois do aviso → ANTES_DA_AUTORIZACAO', async () => {
    const { c, steam, r1 } = await comContemplado()
    hora('2026-10-04', '10:00')
    const { avisoId } = await avisarHades(c, r1.id)
    const anexo = await emTransacao((tx) =>
      salvarAnexo(tx, ctxDe(c, agora()), 'COMPROVANTE_COMPRA', jpeg(1)),
    )
    await expect(
      registrarCompra(ctxDe(c, agora()), {
        rodadaId: r1.id,
        avisoId,
        appId: HADES,
        nome: 'Hades II',
        compradaEm: instanteLocal('2026-10-03', '11:00'),
        valorCentavos: 8990,
        comprovanteId: anexo.id,
        contaSteamId64: steam,
        preVenda: false,
      }),
    ).rejects.toMatchObject({ codigo: 'COMPRA_RECUSADA' })
    hora('2026-10-04', '20:00')
    const { aquisicaoId } = await comprar(c, steam, r1.id, avisoId, 8990)
    const a = await dono.aquisicao.findUniqueOrThrow({ where: { id: aquisicaoId } })
    expect(a.irregularidades).toEqual(['ANTES_DA_AUTORIZACAO'])
  })

  it('CA-55 e CA-64: veto aprovado → Anexo I nº 02 e aviso VETADO; novo aviso substitui o anterior', async () => {
    const { c, outros, r1 } = await comContemplado()
    hora('2026-10-04', '10:00')
    const { avisoId } = await avisarHades(c, r1.id)
    const [a = '', b = '', d = ''] = outros
    const { votacaoId } = await convocar(ctxDe(a, agora()), {
      assunto: 'VETO_JOGO',
      proposicao: 'Vetar Hades II',
      justificativa: 'Já temos um roguelike recente',
      efeito: { tipo: 'VETO_JOGO', avisoId },
    })
    hora('2026-10-04', '11:00')
    const segundo = await avisarHades(c, r1.id, OUTRO) // CA-64
    for (const x of [a, b, d]) {
      await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
    }
    const bloqueio = await dono.jogoBloqueado.findFirstOrThrow({ where: { numero: 2 } })
    expect(bloqueio).toMatchObject({
      nome: 'Hades II',
      appIds: [HADES],
      ataInclusaoNumero: 1,
      motivo: 'Já temos um roguelike recente',
    })
    const antigo = await emTransacao((tx) => fatosDoAviso(tx, avisoId, agora()))
    expect(antigo.status).toBe('VETADO')
    const novo = await emTransacao((tx) => fatosDoAviso(tx, segundo.avisoId, agora()))
    expect(novo.status).toBe('JANELA_VETO')
    expect((await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).prazoCompraAte).toEqual(
      r1.prazoCompraAte,
    )
  })

  it('CA-26 e CA-29: compra autorizada de 8990, concluída → sobra 3510; SOBRA para o próximo contemplado', async () => {
    const { c, steam, r1 } = await comContemplado()
    hora('2026-10-04', '10:00')
    const { avisoId } = await avisarHades(c, r1.id)
    hora('2026-10-06', '11:00') // janela de 48 h encerrada
    await comprar(c, steam, r1.id, avisoId, 8990)
    expect(await concluirAquisicao(ctxDe(c, agora()), { rodadaId: r1.id })).toBe('FECHADA')
    const fechada = await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })
    expect(fechada).toMatchObject({
      status: 'FECHADA',
      gastoCentavos: 8990,
      sobraCentavos: 3510,
      motivoFechamento: 'AQUISICAO_CONCLUIDA',
    })
    expect((await dono.aquisicao.findFirstOrThrow()).irregularidades).toEqual([])

    hora('2026-11-03')
    const r2 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 2 } })
    await executarRodada(r2.id, null, () => 0)
    const r2c = await dono.rodada.findUniqueOrThrow({ where: { id: r2.id } })
    const s = await dono.obrigacao.findFirstOrThrow({ where: { tipo: 'SOBRA' } })
    expect(s).toMatchObject({
      rodadaId: r2.id,
      rodadaOrigemId: r1.id,
      devedorId: c,
      credorId: r2c.contempladoId,
      valorCentavos: 3510,
    })
    expect(s.vencimentoEm).toEqual(instanteLocal('2026-11-04')) // fim do dia do sorteio seguinte
    // CA-105: tick de novo não duplica a SOBRA
    await processarFechamentos({ ator: { tipo: 'SISTEMA' }, agora: agora() })
    await processarFechamentos({ ator: { tipo: 'SISTEMA' }, agora: agora() })
    expect(await dono.obrigacao.count({ where: { tipo: 'SOBRA' } })).toBe(1)
  })

  it('CA-30: r2 "concluída" antes de r1 fechar aguarda; fecha em cadeia com o prêmio que inclui a sobra', async () => {
    const { c, steam, r1 } = await comContemplado()
    hora('2026-11-03')
    const r2 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 2 } })
    await executarRodada(r2.id, null, () => 0)
    const c2 = (await dono.rodada.findUniqueOrThrow({ where: { id: r2.id } })).contempladoId ?? ''
    const steam2 = (await dono.pessoa.findUniqueOrThrow({ where: { id: c2 } })).steamId64 ?? ''
    hora('2026-11-04')
    await comprar(c2, steam2, r2.id, undefined, 5000)
    expect(await concluirAquisicao(ctxDe(c2, agora()), { rodadaId: r2.id })).toBe(
      'AGUARDANDO_ANTERIOR',
    )
    expect(
      (await dono.rodada.findUniqueOrThrow({ where: { id: r2.id } })).fechamentoSolicitado,
    ).toBe('AQUISICAO_CONCLUIDA')

    await comprar(c, steam, r1.id, undefined, 8990) // r1 compra (sem aviso: irregular, mas conta)
    await concluirAquisicao(ctxDe(c, agora()), { rodadaId: r1.id })
    const fim = await dono.rodada.findUniqueOrThrow({ where: { id: r2.id } })
    expect(fim.status).toBe('FECHADA')
    expect(fim.sobraCentavos).toBe(12500 + 3510 - 5000) // prêmio 16010 − gasto 5000
  })

  it('CA-71: ATA CONVERTER_PREMIO_EM_SOBRA numa rodada vencida → fecha com gasto 0 e SOBRA = prêmio', async () => {
    const { r1, outros } = await comContemplado()
    hora('2026-11-04')
    const [a = '', b = '', d = ''] = outros
    const { votacaoId } = await convocar(ctxDe(a, agora()), {
      assunto: 'CASO_OMISSO',
      proposicao: 'Converter o prêmio da rodada 1 em SOBRA',
      justificativa: 'Prazo vencido sem compra',
      efeito: { tipo: 'CONVERTER_PREMIO_EM_SOBRA', rodadaId: r1.id },
    })
    for (const x of [a, b, d]) {
      await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
    }
    expect(await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).toMatchObject({
      status: 'FECHADA',
      gastoCentavos: 0,
      sobraCentavos: 12500,
      motivoFechamento: 'CONVERTIDO_POR_ATA',
    })
  })

  it('CA-66: reembolso no prazo com SOBRA não paga → a rodada reabre e a SOBRA é cancelada', async () => {
    const { c, steam, r1 } = await comContemplado()
    hora('2026-11-03')
    const r2 = await dono.rodada.findFirstOrThrow({ where: { sequencia: 2 } })
    await executarRodada(r2.id, null, () => 0)
    // o relógio volta para dentro do prazo da r1 (até o fim de 02/11), com a r2 já contemplada
    hora('2026-10-20')
    const { aquisicaoId } = await comprar(c, steam, r1.id, undefined, 8990)
    await concluirAquisicao(ctxDe(c, agora()), { rodadaId: r1.id })
    expect(await dono.obrigacao.count({ where: { tipo: 'SOBRA', canceladaEm: null } })).toBe(1)
    const anexo = await emTransacao((tx) =>
      salvarAnexo(tx, ctxDe(c, agora()), 'COMPROVANTE_REEMBOLSO', jpeg(99)),
    )
    const r = await registrarReembolso(ctxDe(c, agora()), {
      aquisicaoId,
      valorCentavos: 8990,
      reembolsadaEm: agora(),
      comprovanteId: anexo.id,
    })
    expect(r).toBe('REABERTA')
    expect((await dono.rodada.findUniqueOrThrow({ where: { id: r1.id } })).status).toBe(
      'CONTEMPLADA',
    )
    expect(await dono.obrigacao.count({ where: { tipo: 'SOBRA', canceladaEm: null } })).toBe(0)
  })

  it('RN-COM-09: conta Steam diferente do contemplado vira irregularidade', async () => {
    const { c, r1 } = await comContemplado()
    hora('2026-10-10')
    const { aquisicaoId } = await comprar(c, '76561197960287999', r1.id, undefined, 8990)
    const a = await dono.aquisicao.findUniqueOrThrow({ where: { id: aquisicaoId } })
    expect(a.irregularidades).toEqual(
      expect.arrayContaining(['SEM_AVISO', 'CONTA_DIFERENTE_DO_CONTEMPLADO']),
    )
  })
})
