'use server'

import { acao } from '@/server/acao'
import { salvarAnexo } from '@/server/anexos'
import { emTransacao } from '@/server/tx'

import { avisarSchema, compraSchema, posseSchema, reembolsoSchema, rodadaSchema } from './schemas'
import {
  avisar,
  concluirAquisicao,
  declararPosse,
  registrarCompra,
  registrarReembolso,
  transferirComoSobra,
} from './servico'

// Ex-membro contemplado continua agindo na própria rodada (RN-SAI-04).
const CONTEMPLADOS = ['MEMBRO', 'EX_COM_PENDENCIA'] as const

export const avisarAcao = acao(
  avisarSchema,
  async (e, ctx) => {
    const evidencia = e.evidencia
    const anexo = evidencia
      ? await emTransacao((tx) => salvarAnexo(tx, ctx, 'EVIDENCIA_VALIDACAO', evidencia))
      : undefined
    return avisar(ctx, {
      ...e,
      declaracoes: e.declaracoes,
      evidenciaAnexoId: anexo?.id,
    })
  },
  { perfis: CONTEMPLADOS },
)

export const declararPosseAcao = acao(posseSchema, (e, ctx) =>
  declararPosse(ctx, { avisoId: e.avisoId, retirar: e.retirar === 'on' }),
)

export const registrarCompraAcao = acao(
  compraSchema,
  async (e, ctx) => {
    const arquivo = e.arquivo
    const anexo = await emTransacao((tx) => salvarAnexo(tx, ctx, 'COMPROVANTE_COMPRA', arquivo))
    return registrarCompra(ctx, {
      rodadaId: e.rodadaId,
      avisoId: e.avisoId,
      appId: e.app,
      nome: e.nome,
      compradaEm: e.compradaEm,
      valorCentavos: e.valor,
      comprovanteId: anexo.id,
      contaSteamId64: e.contaSteamId64,
      preVenda: e.preVenda === 'on',
    })
  },
  { perfis: CONTEMPLADOS },
)

export const registrarReembolsoAcao = acao(
  reembolsoSchema,
  async (e, ctx) => {
    const arquivo = e.arquivo
    const anexo = await emTransacao((tx) => salvarAnexo(tx, ctx, 'COMPROVANTE_REEMBOLSO', arquivo))
    return registrarReembolso(ctx, {
      aquisicaoId: e.aquisicaoId,
      valorCentavos: e.valor,
      reembolsadaEm: e.reembolsadaEm,
      comprovanteId: anexo.id,
    })
  },
  { perfis: CONTEMPLADOS },
)

export const concluirAquisicaoAcao = acao(rodadaSchema, (e, ctx) => concluirAquisicao(ctx, e), {
  perfis: CONTEMPLADOS,
})

export const transferirComoSobraAcao = acao(rodadaSchema, (e, ctx) => transferirComoSobra(ctx, e), {
  perfis: CONTEMPLADOS,
})
