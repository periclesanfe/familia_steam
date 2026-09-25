import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

import { cache } from 'react'

/**
 * 15 §4 (SEG-13): a família da requisição. Toda consulta e transação do consórcio roda com
 * `app.familia_id` definido a partir daqui, e o RLS do banco só mostra as linhas dessa família.
 */
/** Família dos dados anteriores ao M10, do ambiente de desenvolvimento e dos testes. */
export const FAMILIA_PADRAO = '00000000-0000-4000-8000-000000000001'

const armazenamento = new AsyncLocalStorage<string | null>()
let padrao: string | null = null

/**
 * Família da renderização da página (RSC): o guard grava e as consultas leem. `cache` do React
 * vale para a requisição inteira; fora de uma renderização devolve um objeto novo (sem efeito).
 */
const daRequisicao = cache((): { id: string | null | undefined } => ({ id: undefined }))

export const familiaAtual = (): string | null => {
  const explicita = armazenamento.getStore() // comFamilia(): actions, tick, serviços
  if (explicita !== undefined) return explicita
  const pagina = daRequisicao().id
  return pagina === undefined ? padrao : pagina
}

/**
 * Executa `fn` dentro da família (actions, tick, serviços chamados fora de uma requisição).
 * O `await` fica dentro do contexto: consultas do Prisma são preguiçosas e só rodam quando
 * aguardadas, e fora dele veriam outra família.
 */
export const comFamilia = <T>(familiaId: string | null, fn: () => T | Promise<T>): Promise<T> =>
  armazenamento.run(familiaId, async () => await fn())

/** Para páginas: fixa a família no restante da renderização (chamado pelo guard). */
export const entrarNaFamilia = (familiaId: string | null): void => {
  daRequisicao().id = familiaId
}

/** Só para testes: família usada quando nenhuma foi definida no contexto. */
export const definirFamiliaPadrao = (familiaId: string | null): void => {
  padrao = familiaId
}
