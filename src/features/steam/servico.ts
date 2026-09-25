import 'server-only'

import { ErroDeNegocio, exigir } from '@/domain/erros'
import { appIdDeTexto } from '@/domain/steam'
import type { ContextoAcao } from '@/server/acao'
import { registrarEvento } from '@/server/auditoria'
import { db } from '@/server/db'
import { env } from '@/server/env'
import { agora } from '@/server/relogio'
import { emTransacao } from '@/server/tx'

import { sincronizarPessoas } from './sync'

const DEZ_MIN = 10 * 60_000
const SEIS_HORAS = 6 * 3_600_000

/** RN-STM-04: botão "Sincronizar com a Steam", no máximo a cada 10 min. */
export async function sincronizarAgora(ctx: ContextoAcao) {
  exigir(
    env().STEAM_API_KEY,
    'EFEITO_INDISPONIVEL',
    'A integração com a Steam não está configurada.',
  )
  const p = await db.pessoa.findUniqueOrThrow({
    where: { id: ctx.ator.pessoaId },
    select: { steamSincronizadoEm: true },
  })
  if (p.steamSincronizadoEm && ctx.agora.getTime() - p.steamSincronizadoEm.getTime() < DEZ_MIN) {
    throw new ErroDeNegocio(
      'ENTRADA_INVALIDA',
      'Sincronizado há menos de 10 minutos. Tente mais tarde.',
    )
  }
  return sincronizarPessoas([ctx.ator.pessoaId])
}

/** RN-STM-04: depois do login (em `after()`), se a última sincronização tem mais de 6 h. */
export async function sincronizarSeVencido(pessoaId: string): Promise<void> {
  if (!env().STEAM_API_KEY) return
  const p = await db.pessoa.findUnique({
    where: { id: pessoaId },
    select: { steamSincronizadoEm: true },
  })
  if (p?.steamSincronizadoEm && agora().getTime() - p.steamSincronizadoEm.getTime() < SEIS_HORAS)
    return
  await sincronizarPessoas([pessoaId])
}

/**
 * RN-COM-01: item MANUAL da lista de desejos. Link da loja ou appId → appId (o link nunca é
 * buscado, SEG-04); outro texto vira título livre (ex.: chave de outra loja).
 */
export async function adicionarDesejo(ctx: ContextoAcao, e: { texto: string }) {
  const appId = appIdDeTexto(e.texto)
  return emTransacao(async (tx) => {
    const eu = ctx.ator.pessoaId
    if (appId) {
      const ja = await tx.itemListaDesejos.findFirst({
        where: { pessoaId: eu, appId },
        select: { id: true },
      })
      exigir(!ja, 'ENTRADA_INVALIDA', 'Este jogo já está na sua lista.')
    }
    const { _max } = await tx.itemListaDesejos.aggregate({
      where: { pessoaId: eu, origem: 'MANUAL' },
      _max: { posicao: true },
    })
    const item = await tx.itemListaDesejos.create({
      data: {
        pessoaId: eu,
        origem: 'MANUAL',
        appId,
        tituloLivre: appId ? null : e.texto.trim().slice(0, 120),
        posicao: (_max.posicao ?? 0) + 1,
        adicionadoEm: ctx.agora,
      },
      select: { id: true },
    })
    if (appId) {
      await tx.steamApp.createMany({ data: [{ appId, prioridadeSync: 2 }], skipDuplicates: true })
    }
    await registrarEvento(tx, ctx, {
      acao: 'desejo.adicionar',
      entidade: 'item_lista_desejos',
      entidadeId: item.id,
    })
  })
}

/** Só o dono mexe nos próprios itens MANUAL (RN-COM-01). */
async function meuItemManual(pessoaId: string, itemId: string) {
  const item = await db.itemListaDesejos.findUnique({ where: { id: itemId } })
  exigir(item?.pessoaId === pessoaId && item.origem === 'MANUAL', 'NAO_ENCONTRADO')
  return item
}

export async function removerDesejo(ctx: ContextoAcao, e: { itemId: string }) {
  await meuItemManual(ctx.ator.pessoaId, e.itemId)
  return emTransacao(async (tx) => {
    await tx.itemListaDesejos.delete({ where: { id: e.itemId } })
    await registrarEvento(tx, ctx, {
      acao: 'desejo.remover',
      entidade: 'item_lista_desejos',
      entidadeId: e.itemId,
    })
  })
}

/** Reordena trocando a posição com o vizinho (↑↓). */
export async function moverDesejo(
  ctx: ContextoAcao,
  e: { itemId: string; direcao: 'cima' | 'baixo' },
) {
  const item = await meuItemManual(ctx.ator.pessoaId, e.itemId)
  return emTransacao(async (tx) => {
    const vizinho = await tx.itemListaDesejos.findFirst({
      where: {
        pessoaId: ctx.ator.pessoaId,
        origem: 'MANUAL',
        posicao: e.direcao === 'cima' ? { lt: item.posicao } : { gt: item.posicao },
      },
      orderBy: { posicao: e.direcao === 'cima' ? 'desc' : 'asc' },
    })
    if (!vizinho) return
    await tx.itemListaDesejos.update({ where: { id: item.id }, data: { posicao: vizinho.posicao } })
    await tx.itemListaDesejos.update({ where: { id: vizinho.id }, data: { posicao: item.posicao } })
    await registrarEvento(tx, ctx, {
      acao: 'desejo.mover',
      entidade: 'item_lista_desejos',
      entidadeId: item.id,
    })
  })
}
