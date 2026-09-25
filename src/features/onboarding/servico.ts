import 'server-only'

import type { z } from 'zod'

import { ErroDeNegocio, exigir } from '@/domain/erros'
import { mascararPix } from '@/domain/mascara'
import {
  adesaoValida,
  codigoAmigo,
  declaracaoDeAdesao,
  type Parametros,
  parametrosSchema,
  versaoVigente,
} from '@/domain/regulamento'
import { dataLocal, instanteLocal, mesDe, paraDb, primeiroDiaApos } from '@/domain/tempo'
import type { ContextoAcao } from '@/server/acao'
import { registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'
import { emTransacao, travar } from '@/server/tx'

import type { dadosCadastroSchema } from './schemas'

/** RN-ACE-06 passos 1–3: nome, apelido, chave Pix e maioridade (RN-CAD-02/05). */
export async function salvarDados(ctx: ContextoAcao, d: z.output<typeof dadosCadastroSchema>) {
  return emTransacao(async (tx) => {
    const antes = await tx.pessoa.findUniqueOrThrow({
      where: { id: ctx.ator.pessoaId },
      select: {
        nome: true,
        apelido: true,
        chavePix: true,
        tipoChavePix: true,
        maioridadeDeclaradaEm: true,
      },
    })
    const trocouPix = antes.chavePix !== d.chavePix
    const depois = await tx.pessoa.update({
      where: { id: ctx.ator.pessoaId },
      data: {
        nome: d.nome,
        apelido: d.apelido,
        chavePix: d.chavePix,
        tipoChavePix: d.tipoChavePix,
        ...(trocouPix ? { chavePixAlteradaEm: ctx.agora } : {}),
        maioridadeDeclaradaEm: antes.maioridadeDeclaradaEm ?? ctx.agora,
      },
      select: {
        nome: true,
        apelido: true,
        chavePix: true,
        tipoChavePix: true,
        maioridadeDeclaradaEm: true,
      },
    })
    await registrarEvento(tx, ctx, {
      acao: 'pessoa.cadastro',
      entidade: 'pessoa',
      entidadeId: ctx.ator.pessoaId,
      dados: { antes, depois }, // chavePix mascarada pelo registrarEvento
    })
  })
}

/**
 * RN-REG-07: assinatura eletrônica do próprio titular. Para fundadores, a última adesão válida
 * põe a 1.0 em vigor, ativa os fundadores e cria o ciclo 1 com a rodada 1 (RN-REG-01, RN-CIC-01).
 */
export async function assinarRegulamento(ctx: ContextoAcao) {
  return emTransacao(async (tx) => {
    await travar(tx, 'regulamento') // duas últimas assinaturas simultâneas: uma vigência só
    const pessoa = await tx.pessoa.findUniqueOrThrow({
      where: { id: ctx.ator.pessoaId },
      select: {
        nome: true,
        apelido: true,
        steamId64: true,
        steamNick: true,
        chavePix: true,
        maioridadeDeclaradaEm: true,
        membros: {
          where: { status: { not: 'ENCERRADO' } },
          select: { id: true, status: true, origem: true },
        },
      },
    })
    const membro = pessoa.membros[0]
    exigir(
      membro?.status === 'AGUARDANDO_ADESAO',
      'SEM_PERMISSAO',
      'Não há adesão pendente para você.',
    )
    exigir(
      pessoa.nome && pessoa.steamId64 && pessoa.chavePix && pessoa.maioridadeDeclaradaEm,
      'ENTRADA_INVALIDA',
      'Complete nome, chave Pix e a declaração de maioridade antes de assinar.',
      'art. 2º, II',
    )
    // ponytail: admissão (AGUARDANDO_CICLO, RN-CAD-12) entra no M8b; aqui só fundadores
    exigir(membro.origem === 'FUNDADOR', 'SEM_PERMISSAO', 'A adesão de admitidos entra no M8b.')

    const versoes = await tx.versaoRegulamento.findMany({
      select: {
        id: true,
        ordem: true,
        numero: true,
        sha256: true,
        vigenteDesde: true,
        parametros: true,
      },
    })
    const alvo = versaoVigente(versoes, ctx.agora) ?? versoes.find((v) => v.ordem === 0)
    if (!alvo)
      throw new ErroDeNegocio('REGULAMENTO_NAO_VIGENTE', 'Não há versão do Regulamento carregada.')

    const amigo = codigoAmigo(pessoa.steamId64)
    const jaAssinou = await tx.adesao.findFirst({
      where: {
        pessoaId: ctx.ator.pessoaId,
        versaoId: alvo.id,
        sha256Versao: alvo.sha256,
        codigoAmigo: amigo,
      },
      select: { id: true },
    })
    exigir(!jaAssinou, 'ENTRADA_INVALIDA', 'Você já assinou esta versão.')

    const adesao = await tx.adesao.create({
      data: {
        pessoaId: ctx.ator.pessoaId,
        versaoId: alvo.id,
        sha256Versao: alvo.sha256,
        nome: pessoa.nome,
        steamNick: pessoa.steamNick ?? pessoa.apelido,
        codigoAmigo: amigo,
        chavePixMascarada: mascararPix(pessoa.chavePix),
        declaracao: declaracaoDeAdesao(alvo.numero),
        assinadaEm: ctx.agora,
      },
      select: { id: true },
    })
    await registrarEvento(tx, ctx, {
      acao: 'adesao.assinar',
      entidade: 'adesao',
      entidadeId: adesao.id,
      dados: { depois: { versao: alvo.numero, sha256: alvo.sha256 } },
    })

    if (alvo.ordem === 0 && !alvo.vigenteDesde) {
      await talvezIniciarVigencia(tx, ctx, {
        ...alvo,
        parametros: parametrosSchema.parse(alvo.parametros),
      })
    }
  })
}

/** RN-REG-01 + RN-CIC-01: com a última adesão válida dos fundadores, a 1.0 entra em vigor. */
async function talvezIniciarVigencia(
  tx: Tx,
  ctx: ContextoAcao,
  versao: { id: string; sha256: string; parametros: Parametros },
) {
  const fundadores = await tx.membro.findMany({
    where: { origem: 'FUNDADOR', status: { not: 'ENCERRADO' } },
    select: {
      id: true,
      pessoa: {
        select: {
          steamId64: true,
          adesoes: {
            where: { versaoId: versao.id },
            select: { sha256Versao: true, codigoAmigo: true },
          },
        },
      },
    },
  })
  const todosAssinaram = fundadores.every((f) =>
    f.pessoa.adesoes.some((a) => adesaoValida(a, versao, { steamId64: f.pessoa.steamId64 ?? '' })),
  )
  if (!todosAssinaram) return

  await tx.versaoRegulamento.update({ where: { id: versao.id }, data: { vigenteDesde: ctx.agora } })
  await tx.membro.updateMany({
    where: { id: { in: fundadores.map((f) => f.id) } },
    data: { status: 'ATIVO', ativadoEm: ctx.agora },
  })
  const dataInicio = primeiroDiaApos(dataLocal(ctx.agora), versao.parametros.diaSorteio)
  const ciclo = await tx.ciclo.create({
    data: {
      numero: 1,
      dataInicio: paraDb(dataInicio),
      status: 'PLANEJADO',
      rodadas: {
        create: {
          sequencia: 1,
          mesReferencia: mesDe(dataInicio),
          agendadaPara: instanteLocal(dataInicio, versao.parametros.horaSorteio),
        },
      },
    },
    select: { id: true },
  })
  await registrarEvento(tx, ctx, {
    acao: 'regulamento.vigencia',
    entidade: 'versao_regulamento',
    entidadeId: versao.id,
    dados: { depois: { vigenteDesde: ctx.agora, fundadores: fundadores.length } },
  })
  await registrarEvento(tx, ctx, {
    acao: 'ciclo.criar',
    entidade: 'ciclo',
    entidadeId: ciclo.id,
    dados: { depois: { numero: 1, dataInicio } },
  })
}
