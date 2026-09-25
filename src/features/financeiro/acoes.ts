'use server'

import { acao } from '@/server/acao'
import { salvarAnexo } from '@/server/anexos'
import { emTransacao } from '@/server/tx'

import {
  contestarSchema,
  enviarAnexoSchema,
  justificarObrigacaoSchema,
  pagamentoSchema,
  pagarSchema,
  registrarPagamentoSchema,
} from './schemas'
import { justificarObrigacao, mudarPagamento, registrarPagamento } from './servico'

const PAGANTES = ['MEMBRO', 'EX_COM_PENDENCIA'] as const

export const registrarPagamentoAcao = acao(
  registrarPagamentoSchema,
  (e, ctx) => registrarPagamento(ctx, e),
  {
    perfis: PAGANTES,
  },
)
export const confirmarPagamentoAcao = acao(
  pagamentoSchema,
  (e, ctx) => mudarPagamento(ctx, e, 'CONFIRMAR'),
  {
    perfis: PAGANTES,
  },
)
export const contestarPagamentoAcao = acao(
  contestarSchema,
  (e, ctx) => mudarPagamento(ctx, e, 'CONTESTAR'),
  {
    perfis: PAGANTES,
  },
)
export const retirarContestacaoAcao = acao(
  pagamentoSchema,
  (e, ctx) => mudarPagamento(ctx, e, 'RETIRAR_CONTESTACAO'),
  { perfis: PAGANTES },
)
export const cancelarPagamentoAcao = acao(
  pagamentoSchema,
  (e, ctx) => mudarPagamento(ctx, e, 'CANCELAR'),
  {
    perfis: PAGANTES,
  },
)
export const justificarObrigacaoAcao = acao(
  justificarObrigacaoSchema,
  (e, ctx) => justificarObrigacao(ctx, e),
  {
    perfis: PAGANTES,
  },
)

// RN-ACE-09: um arquivo por chamada, ≤ 5 MB, tipo pelos magic bytes
export const enviarAnexoAcao = acao(
  enviarAnexoSchema,
  (e, ctx) => emTransacao((tx) => salvarAnexo(tx, ctx, e.tipo, e.arquivo)),
  { perfis: PAGANTES },
)

export const pagarAcao = acao(
  pagarSchema,
  async (e, ctx) => {
    const arquivo = e.arquivo
    const anexo = arquivo
      ? await emTransacao((tx) => salvarAnexo(tx, ctx, 'COMPROVANTE_PIX', arquivo))
      : undefined
    return registrarPagamento(ctx, {
      obrigacaoId: e.obrigacaoId,
      valor: e.valor,
      pixEm: e.pixEm,
      ...(anexo ? { anexoId: anexo.id } : {}),
      ...(e.formaDiversa ? { formaDiversa: e.formaDiversa } : {}),
      recebedorId: e.recebedorId,
    })
  },
  { perfis: PAGANTES },
)
