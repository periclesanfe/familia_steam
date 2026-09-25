import 'server-only'

import { aquisicaoAtiva, type Validacao } from '@/domain/compra'
import { complementacao, gasto, sobra } from '@/domain/financeiro'
import { db } from '@/server/db'

import { premioDaRodada } from './fechamento'
import { fatosDoAviso } from './servico'

/** 07 §3.4, aba Jogo: avisos com status derivado, aquisições e o resumo financeiro da rodada. */
export async function jogoDaRodada(rodadaId: string, pessoaId: string, agora: Date) {
  const [rodada, avisos, aquisicoes] = await Promise.all([
    db.rodada.findUniqueOrThrow({
      where: { id: rodadaId },
      select: {
        id: true,
        status: true,
        contempladoId: true,
        prazoCompraAte: true,
        fechamentoSolicitado: true,
        gastoCentavos: true,
        sobraCentavos: true,
        contemplado: { select: { steamId64: true } },
        cessoes: {
          where: { status: { in: ['AGUARDANDO_ACEITE', 'EM_VOTACAO'] } },
          select: { id: true },
        },
      },
    }),
    db.avisoCompra.findMany({
      where: { rodadaId },
      orderBy: { avisadoEm: 'desc' },
      select: { id: true },
    }),
    db.aquisicao.findMany({
      where: { rodadaId },
      orderBy: { registradaEm: 'asc' },
      select: {
        id: true,
        appId: true,
        nome: true,
        compradaEm: true,
        valorCentavos: true,
        reembolsoValorCentavos: true,
        irregularidades: true,
        verificacaoBiblioteca: true,
        comprovanteId: true,
        regularizadaAtaNumero: true,
      },
    }),
  ])
  const detalhes = await db.$transaction(async (tx) =>
    Promise.all(avisos.map((a) => fatosDoAviso(tx, a.id, agora))),
  )
  const premioR = await premioDaRodada(db, rodadaId)
  const gastoR = gasto(aquisicoes)
  const souContemplado = rodada.contempladoId === pessoaId
  const aberta = rodada.status === 'CONTEMPLADA'
  const noPrazo = rodada.prazoCompraAte !== null && agora < rodada.prazoCompraAte
  return {
    rodada: { ...rodada, steamContemplado: rodada.contemplado?.steamId64 ?? null },
    avisos: detalhes.map((d) => ({
      id: d.aviso.id,
      nome: d.aviso.nome,
      appId: d.aviso.appId,
      tipo: d.aviso.tipo,
      origemNaLista: d.aviso.origemNaLista,
      avisadoEm: d.aviso.avisadoEm,
      janelaVetoAte: d.aviso.janelaVetoAte,
      validacoes: d.aviso.validacoes as Validacao[],
      declarantes: d.aviso.declarantesPosseIds.length,
      euDeclarei: d.aviso.declarantesPosseIds.includes(pessoaId),
      status: d.status,
      autorizadoEm: d.autorizadoEm,
      exige16IV: d.fatos.exige16IV,
      tem16IV: d.fatos.votacoes16IV.length > 0,
      temVeto: d.fatos.veto !== null,
    })),
    aquisicoes: aquisicoes.map((a) => ({ ...a, ativa: aquisicaoAtiva(a) })),
    resumo: {
      premioCentavos: premioR,
      gastoCentavos: rodada.gastoCentavos ?? gastoR,
      sobraCentavos: rodada.sobraCentavos ?? sobra(premioR, gastoR),
      complementacaoCentavos: complementacao(premioR, gastoR),
    },
    souContemplado,
    pode: {
      avisar: souContemplado && aberta && noPrazo && rodada.cessoes.length === 0,
      comprar: souContemplado && aberta,
      concluir:
        souContemplado &&
        aberta &&
        aquisicoes.some(aquisicaoAtiva) &&
        rodada.fechamentoSolicitado === null,
      transferir:
        souContemplado &&
        aberta &&
        noPrazo &&
        aquisicoes.some((a) => a.reembolsoValorCentavos !== null),
      reembolsar: souContemplado && (aberta || rodada.status === 'FECHADA'),
    },
    prazoVencido: aberta && !noPrazo && aquisicoes.length === 0,
  }
}
