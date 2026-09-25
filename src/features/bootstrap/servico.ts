import 'server-only'

import { hashVersao, sha256hex } from '@/domain/hash'
import { numeroDaVersao, type Parametros } from '@/domain/regulamento'
import { paraDb } from '@/domain/tempo'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import { dbBase, type Tx } from '@/server/db'
import { comFamilia, FAMILIA_PADRAO } from '@/server/familia'
import { emTransacao } from '@/server/tx'

import type { Bootstrap } from './schema'

const OPERADOR: Contexto['ator'] = { tipo: 'OPERADOR' }

export class ErroDeBootstrap extends Error {}

/**
 * RN-FAM-02 / RN-BLO-01: versão 1.0 da família (ainda sem vigência) e a entrada 01 do Anexo I,
 * protegida. Roda dentro da família (RLS).
 */
export async function criarGenese(
  tx: Tx,
  texto: string,
  parametros: Parametros,
): Promise<{ versaoId: string; sha256Versao: string }> {
  const sha256Versao = hashVersao(texto, parametros)
  const versao = await tx.versaoRegulamento.create({
    data: {
      ordem: 0,
      numero: numeroDaVersao(0),
      textoMarkdown: texto,
      parametros,
      sha256: sha256Versao,
    },
    select: { id: true },
  })
  await tx.jogoBloqueado.create({
    data: {
      numero: 1,
      tipo: 'CATEGORIA',
      nome: 'Jogos de conteúdo pornográfico (categoria)',
      appIds: [],
      origemTexto: 'Versão 1.0',
      motivo: 'Vedação expressa do art. 17',
      protegida: true,
    },
  })
  return { versaoId: versao.id, sha256Versao }
}

/**
 * RN-ACE-10 (art. 46), hoje só para desenvolvimento e testes: cria a família `familiaId` já com
 * os fundadores e integrantes. Devolve o sha256 da versão 1.0 e o do arquivo.
 */
export async function executarBootstrap(
  b: Bootstrap,
  texto: string,
  arquivoBruto: string,
  agora: Date,
  familiaId: string = FAMILIA_PADRAO,
): Promise<{ sha256Versao: string; sha256Arquivo: string }> {
  const sha256Arquivo = sha256hex(arquivoBruto)
  const ctx = { ator: OPERADOR, agora }
  const ocupados = await dbBase.pessoa.count({
    where: { steamId64: { in: b.fundadores.map((f) => f.steam) }, familiaId: { not: null } },
  })
  if (ocupados > 0 || (await dbBase.familia.count({ where: { id: familiaId } })) > 0) {
    throw new ErroDeBootstrap('A família já existe ou um fundador já está em outra família.')
  }
  await dbBase.familia.create({
    data: { id: familiaId, nome: 'Família Steam', criadaPorId: familiaId, criadaEm: agora },
  })
  return comFamilia(familiaId, () =>
    emTransacao(async (tx) => {
      for (const f of b.fundadores) {
        // eslint-disable-next-line no-await-in-loop -- carga única de ≤ 6 pessoas, na mesma transação
        await tx.pessoa.create({
          data: {
            nome: f.nome,
            apelido: f.apelido,
            steamId64: f.steam,
            familiaId,
            membros: { create: { origem: 'FUNDADOR', status: 'AGUARDANDO_ADESAO' } },
            integrantes: {
              create: {
                steamId64: f.steam,
                origem: 'PRE_EXISTENTE',
                status: 'ATIVO',
                entrouEm: paraDb(f.entrouNaFamiliaEm),
              },
            },
          },
        })
      }
      for (const i of b.integrantes) {
        // eslint-disable-next-line no-await-in-loop -- idem
        await tx.pessoa.create({
          data: {
            apelido: i.apelido,
            steamId64: i.steam ?? null,
            familiaId,
            integrantes: {
              create: {
                steamId64: i.steam ?? null,
                origem: 'PRE_EXISTENTE',
                status: 'ATIVO',
                entrouEm: paraDb(i.entrouNaFamiliaEm),
              },
            },
          },
        })
      }
      const { versaoId, sha256Versao } = await criarGenese(tx, texto, b.parametros)
      await registrarEvento(tx, ctx, {
        acao: 'bootstrap.genese',
        entidade: 'versao_regulamento',
        entidadeId: versaoId,
        dados: {
          depois: {
            sha256Versao,
            sha256Arquivo,
            fundadores: b.fundadores.map((f) => f.apelido),
            integrantes: b.integrantes.map((i) => i.apelido),
          },
        },
      })
      return { sha256Versao, sha256Arquivo }
    }),
  )
}

/**
 * RN-ACE-10, correções antes da vigência. Texto ou parâmetros novos mudam o sha256 e invalidam
 * todas as adesões (CA-90); SteamID novo de um fundador invalida só a adesão dele (adesaoValida
 * compara o código de amigo) e revoga as sessões dele (CA-125). Fundadores casados pelo apelido.
 */
export async function corrigirBootstrap(
  b: Bootstrap,
  texto: string,
  agora: Date,
  familiaId: string = FAMILIA_PADRAO,
): Promise<{ sha256Versao: string; alteracoes: string[] }> {
  const ctx = { ator: OPERADOR, agora }
  const sha256Versao = hashVersao(texto, b.parametros)
  const alteracoes: string[] = []

  await comFamilia(familiaId, () =>
    emTransacao(async (tx) => {
      const v10 = await tx.versaoRegulamento.findFirst({ where: { ordem: 0 } })
      if (!v10) throw new ErroDeBootstrap('Não há bootstrap para corrigir.')
      if (v10.vigenteDesde)
        throw new ErroDeBootstrap('A 1.0 já está vigente: a CLI não escreve mais.')

      if (v10.sha256 !== sha256Versao) {
        await tx.versaoRegulamento.update({
          where: { id: v10.id },
          data: { textoMarkdown: texto, parametros: b.parametros, sha256: sha256Versao },
        })
        await registrarEvento(tx, ctx, {
          acao: 'bootstrap.corrigir_texto',
          entidade: 'versao_regulamento',
          entidadeId: v10.id,
          dados: { antes: { sha256: v10.sha256 }, depois: { sha256: sha256Versao } },
        })
        alteracoes.push(
          `texto/parâmetros: ${v10.sha256.slice(0, 12)}… → ${sha256Versao.slice(0, 12)}…`,
        )
      }

      const fundadores = await tx.pessoa.findMany({
        where: { membros: { some: { origem: 'FUNDADOR' } } },
        select: { id: true, apelido: true, nome: true, steamId64: true },
      })
      for (const f of b.fundadores) {
        const atual = fundadores.find((p) => p.apelido.toLowerCase() === f.apelido.toLowerCase())
        if (!atual) throw new ErroDeBootstrap(`Fundador desconhecido: ${f.apelido}`)
        if (atual.nome === f.nome && atual.steamId64 === f.steam) continue
        // eslint-disable-next-line no-await-in-loop -- correção pontual, ≤ 6 fundadores
        await tx.pessoa.update({
          where: { id: atual.id },
          data: { nome: f.nome, steamId64: f.steam },
        })
        if (atual.steamId64 !== f.steam) {
          // eslint-disable-next-line no-await-in-loop -- idem
          await tx.integranteFamilia.updateMany({
            where: { pessoaId: atual.id, origem: 'PRE_EXISTENTE' },
            data: { steamId64: f.steam },
          })
          // eslint-disable-next-line no-await-in-loop -- idem
          await tx.sessao.updateMany({
            where: { pessoaId: atual.id, revogadaEm: null },
            data: { revogadaEm: agora },
          })
        }
        // eslint-disable-next-line no-await-in-loop -- idem
        await registrarEvento(tx, ctx, {
          acao: 'bootstrap.corrigir_fundador',
          entidade: 'pessoa',
          entidadeId: atual.id,
          dados: {
            antes: { nome: atual.nome, steamId64: atual.steamId64 },
            depois: { nome: f.nome, steamId64: f.steam },
          },
        })
        alteracoes.push(`fundador ${f.apelido}`)
      }
    }),
  )
  return { sha256Versao, alteracoes }
}
