import 'server-only'

import { randomUUID } from 'node:crypto'

import { gerarAta, nomeDoAssunto } from '@/domain/ata'
import { podeConvocarVeto } from '@/domain/compra'
import { chaveObjeto, type Efeito, efeitoCombina, efeitoSchema } from '@/domain/efeitos'
import { ErroDeNegocio, exigir } from '@/domain/erros'
import { sha256hex } from '@/domain/hash'
import { apurarVotacao, calcularQuorum } from '@/domain/quorum'
import { parametrosSchema, versaoVigente } from '@/domain/regulamento'
import { dataLocal, paraDb, somarHoras } from '@/domain/tempo'
import { Prisma } from '@/generated/prisma/client'
import type { AssuntoVotacao, OpcaoVoto } from '@/generated/prisma/enums'
import { formatarDataHora } from '@/lib/formato'
import type { ContextoAcao } from '@/server/acao'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import { db, type Tx } from '@/server/db'
import { agora } from '@/server/relogio'
import { emTransacao, travar } from '@/server/tx'

import { descreverEfeito } from './descricao'
import { aplicarEfeito, efeitoDisponivel } from './efeitos'

const APTOS = { status: { in: ['ATIVO' as const, 'IMPOSSIBILITADO' as const] } }

/** RN-VOT-01/02: convoca com snapshot de eleitores, quórum e versão vigente. */
export async function convocar(
  ctx: ContextoAcao,
  e: { assunto: AssuntoVotacao; proposicao: string; justificativa: string; efeito: Efeito },
): Promise<{ votacaoId: string }> {
  exigir(
    e.assunto !== 'CESSAO_VEZ',
    'ENTRADA_INVALIDA',
    'A cessão nasce do aceite do beneficiário.',
    'art. 13',
  )
  const efeito = efeitoSchema.parse(e.efeito)
  exigir(
    efeitoCombina(e.assunto, efeito),
    'ENTRADA_INVALIDA',
    'O efeito não corresponde ao assunto.',
  )
  if (!efeitoDisponivel(efeito.tipo)) throw new ErroDeNegocio('EFEITO_INDISPONIVEL')

  try {
    return await emTransacao(async (tx) => {
      await validarPreCondicao(tx, efeito)
      const r = await abrirVotacao(tx, ctx, ctx.ator.pessoaId, { ...e, efeito })
      exigir(r.eleitoresIds.includes(ctx.ator.pessoaId), 'SEM_PERMISSAO')
      return { votacaoId: r.votacaoId }
    })
  } catch (erro) {
    // CA-79 / CA-84: índice único (assunto, chaveObjeto) das abertas
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroDeNegocio('VOTACAO_DUPLICADA')
    }
    throw erro
  }
}

/**
 * RN-VOT-01/02: grava a votação com snapshot de eleitores, quórum e versão vigente. Também usada
 * pelo aceite da cessão, que abre a CESSAO_VEZ com o cedente como convocante (RN-CES-03).
 */
export async function abrirVotacao(
  tx: Tx,
  ctx: Contexto,
  convocadaPorId: string,
  e: { assunto: AssuntoVotacao; proposicao: string; justificativa: string; efeito: Efeito },
): Promise<{ votacaoId: string; eleitoresIds: string[] }> {
  const versoes = await tx.versaoRegulamento.findMany({
    select: { id: true, ordem: true, vigenteDesde: true, parametros: true, numero: true },
  })
  const versao = versaoVigente(versoes, ctx.agora)
  if (!versao) throw new ErroDeNegocio('REGULAMENTO_NAO_VIGENTE') // CA-89
  const p = parametrosSchema.parse(versao.parametros)
  const eleitores = await tx.membro.findMany({ where: APTOS, select: { pessoaId: true } })
  const eleitoresIds = eleitores.map((m) => m.pessoaId)
  const impedidosIds = e.efeito.tipo === 'PERMANENCIA_ART30' ? [e.efeito.pessoaId] : []
  const id = randomUUID()
  await tx.votacao.create({
    data: {
      id,
      assunto: e.assunto,
      proposicao: e.proposicao,
      justificativa: e.justificativa,
      efeito: e.efeito,
      chaveObjeto: chaveObjeto(e.efeito, id),
      convocadaPorId,
      abertaEm: ctx.agora,
      encerraEm: somarHoras(ctx.agora, p.horasVotacao),
      eleitoresIds,
      impedidosIds,
      n: eleitoresIds.length,
      quorum: calcularQuorum(eleitoresIds.length),
      versaoRegulamentoId: versao.id,
    },
  })
  await registrarEvento(tx, ctx, {
    acao: 'votacao.convocar',
    entidade: 'votacao',
    entidadeId: id,
    dados: { depois: { assunto: e.assunto, efeito: e.efeito.tipo, n: eleitoresIds.length } },
  })
  return { votacaoId: id, eleitoresIds }
}

/** Pré-condições verificadas já na convocação (o efeito ainda revalida na aprovação). */
async function validarPreCondicao(tx: Tx, efeito: Efeito): Promise<void> {
  if (efeito.tipo === 'EXCLUSAO_BLOQUEIO') {
    const b = await tx.jogoBloqueado.findFirst({ where: { numero: efeito.numero } })
    exigir(b && !b.excluidoEm, 'NAO_ENCONTRADO', 'Entrada do Anexo I inexistente ou já excluída.')
    exigir(
      !b.protegida,
      'ENTRADA_INVALIDA',
      'A entrada 01 só sai com uma alteração do Regulamento que revogue o art. 17 (RN-BLO-04).',
      'art. 17',
    ) // CA-81
  }
  if (efeito.tipo === 'VALIDAR_PAGAMENTO' || efeito.tipo === 'INVALIDAR_PAGAMENTO') {
    exigir(await tx.pagamento.findUnique({ where: { id: efeito.pagamentoId } }), 'NAO_ENCONTRADO')
  }
  if (efeito.tipo === 'VETO_JOGO' || efeito.tipo === 'JOGO_DE_OUTRO_MEMBRO') {
    const aviso = await tx.avisoCompra.findUnique({
      where: { id: efeito.avisoId },
      select: { janelaVetoAte: true, substituidoEm: true },
    })
    exigir(aviso, 'NAO_ENCONTRADO', 'Aviso inexistente.')
    if (efeito.tipo === 'VETO_JOGO') {
      // RN-COM-06 (CA-54): só com a janela aberta e sobre o aviso ativo
      exigir(
        !aviso.substituidoEm && podeConvocarVeto(aviso.janelaVetoAte, agora()),
        'ENTRADA_INVALIDA',
        'A janela de veto deste aviso já fechou.',
        'art. 23',
      )
    }
  }
  if (
    efeito.tipo === 'CONVERTER_PREMIO_EM_SOBRA' ||
    efeito.tipo === 'PERMITIR_MULTIPLAS_AQUISICOES'
  ) {
    exigir(await tx.rodada.findUnique({ where: { id: efeito.rodadaId } }), 'NAO_ENCONTRADO')
  }
  if (efeito.tipo === 'REGULARIZAR_AQUISICAO') {
    exigir(await tx.aquisicao.findUnique({ where: { id: efeito.aquisicaoId } }), 'NAO_ENCONTRADO')
  }
  if (efeito.tipo === 'PERMANENCIA_ART30') {
    const m = await tx.membro.findFirst({
      where: { pessoaId: efeito.pessoaId, status: 'IMPOSSIBILITADO' },
    })
    exigir(
      m,
      'ENTRADA_INVALIDA',
      'Só se delibera a permanência de quem está impossibilitado.',
      'art. 30',
    )
  }
  if (efeito.tipo === 'CANCELAR_OBRIGACAO') {
    exigir(await tx.obrigacao.findUnique({ where: { id: efeito.obrigacaoId } }), 'NAO_ENCONTRADO')
  }
}

/** RN-VOT-03/04: voto irretratável, nominal; apura e encerra na mesma transação. */
export async function votar(
  ctx: ContextoAcao,
  e: { votacaoId: string; opcao: OpcaoVoto },
): Promise<void> {
  const previa = await db.votacao.findUniqueOrThrow({
    where: { id: e.votacaoId },
    select: { status: true, encerraEm: true },
  })
  if (previa.status === 'ABERTA' && ctx.agora >= previa.encerraEm) {
    // RN-VOT-13: materializa o encerramento por prazo na própria transação (sobrevive à recusa)
    await fecharVotacao(e.votacaoId)
    throw new ErroDeNegocio('VOTACAO_ENCERRADA')
  }
  return emTransacao(async (tx) => {
    await travar(tx, 'fechamento') // ordem fixa (RN-GER-06): efeitos futuros podem fechar rodada
    await travar(tx, `votacao:${e.votacaoId}`)
    const v = await tx.votacao.findUniqueOrThrow({
      where: { id: e.votacaoId },
      include: { votos: true },
    })
    exigir(v.status === 'ABERTA' && ctx.agora < v.encerraEm, 'VOTACAO_ENCERRADA')
    const eu = ctx.ator.pessoaId
    exigir(v.eleitoresIds.includes(eu) && !v.impedidosIds.includes(eu), 'ELEITOR_INVALIDO')
    exigir(ctx.perfil.perfil === 'MEMBRO', 'ELEITOR_INVALIDO') // quem saiu não vota
    exigir(!v.votos.some((x) => x.pessoaId === eu), 'VOTO_JA_REGISTRADO')
    await tx.voto.create({
      data: { votacaoId: v.id, pessoaId: eu, opcao: e.opcao, votadoEm: ctx.agora },
    })
    await registrarEvento(tx, ctx, {
      acao: 'votacao.votar',
      entidade: 'votacao',
      entidadeId: v.id,
      dados: { depois: { opcao: e.opcao } },
    })
    await encerrarSeDecidida(tx, ctx, v.id)
  })
}

/** Encerra uma votação decidida (prazo, quórum ou impossibilidade) na própria transação. */
export const fecharVotacao = (votacaoId: string): Promise<boolean> =>
  emTransacao(async (tx) => {
    await travar(tx, 'fechamento')
    await travar(tx, `votacao:${votacaoId}`)
    return encerrarSeDecidida(tx, { ator: { tipo: 'SISTEMA' }, agora: agora() }, votacaoId)
  })

/** Apura e, se decidida, encerra: ATA numerada sem lacunas + efeito (RN-VOT-04/06/07). */
async function encerrarSeDecidida(tx: Tx, ctx: Contexto, votacaoId: string): Promise<boolean> {
  const v = await tx.votacao.findUniqueOrThrow({
    where: { id: votacaoId },
    include: { votos: true, versaoRegulamento: { select: { numero: true } } },
  })
  if (v.status !== 'ABERTA') return false
  const membros = new Set(
    (
      await tx.membro.findMany({
        where: { ...APTOS, pessoaId: { in: v.eleitoresIds } },
        select: { pessoaId: true },
      })
    ).map((m) => m.pessoaId),
  )
  const r = apurarVotacao(v, v.votos, ctx.agora, membros)
  if (r.status === 'ABERTA') return false

  await travar(tx, 'ata')
  const { _max } = await tx.ata.aggregate({ _max: { numero: true } })
  const numero = (_max.numero ?? 0) + 1
  const efeito = efeitoSchema.parse(v.efeito)
  await tx.votacao.update({
    where: { id: v.id },
    data: { status: r.status, encerradaEm: r.encerradaEm, motivoEncerramento: r.motivo },
  })
  const resultado =
    r.status === 'APROVADA'
      ? await aplicarEfeito(tx, ctx, efeito, numero, r.encerradaEm, v)
      : 'nenhum (rejeitada)'
  if (r.status === 'REJEITADA') {
    // RN-FAM-05: indicação levada à votação e rejeitada
    await tx.indicacao.updateMany({
      where: { votacaoId: v.id, status: 'ABERTA' },
      data: { status: 'RECUSADA', encerradaEm: r.encerradaEm },
    })
  }
  if (r.status === 'REJEITADA' && efeito.tipo === 'CESSAO_VEZ') {
    // RN-CES-06: rejeitada, nada muda além do status da proposta (CA-49)
    await tx.cessao.update({
      where: { id: efeito.cessaoId },
      data: { status: 'REJEITADA', encerradaEm: r.encerradaEm },
    })
  }
  if (r.status === 'APROVADA') {
    await tx.votacao.update({
      where: { id: v.id },
      data: resultado.startsWith('não aplicável')
        ? { efeitoNaoAplicavel: resultado }
        : { efeitoAplicadoEm: r.encerradaEm },
    })
  }

  const pessoas = await tx.pessoa.findMany({
    where: { id: { in: [...v.eleitoresIds, v.convocadaPorId] } },
    select: { id: true, nome: true, apelido: true },
  })
  const nome = (id: string) => {
    const p = pessoas.find((x) => x.id === id)
    return p ? (p.nome ?? p.apelido) : id
  }
  const votaram = new Set(v.votos.map((x) => x.pessoaId))
  const markdown = gerarAta({
    numero,
    data: dataLocal(r.encerradaEm),
    convocante: nome(v.convocadaPorId),
    assunto: v.assunto,
    efeito,
    descricaoEfeito: await descreverEfeito(tx, efeito),
    proposicao: v.proposicao,
    justificativa: v.justificativa,
    votos: v.votos.map((x) => ({ nome: nome(x.pessoaId), opcao: x.opcao })),
    naoVotaram: v.eleitoresIds
      .filter((id) => !votaram.has(id) && !v.impedidosIds.includes(id))
      .map(nome),
    impedidos: v.impedidosIds.map(nome),
    aprovada: r.status === 'APROVADA',
    motivo: r.motivo,
    abertaEm: formatarDataHora(v.abertaEm),
    encerradaEm: formatarDataHora(r.encerradaEm),
    n: v.n,
    quorum: v.quorum,
    versao: v.versaoRegulamento.numero,
    resultadoDoEfeito: resultado,
  })
  await tx.ata.create({
    data: {
      numero,
      votacaoId: v.id,
      data: paraDb(dataLocal(r.encerradaEm)),
      markdown,
      sha256: sha256hex(markdown),
      geradaEm: ctx.agora,
    },
  })
  await registrarEvento(tx, ctx, {
    acao: `votacao.${r.status.toLowerCase()}`,
    entidade: 'votacao',
    entidadeId: v.id,
    dados: { depois: { motivo: r.motivo, ata: numero, efeito: resultado } },
    ataNumero: numero,
  })
  return true
}

/** RN-VOT-05: o convocante cancela antes de qualquer voto de outro membro; nunca VETO_JOGO. */
export async function cancelarVotacao(ctx: ContextoAcao, e: { votacaoId: string }): Promise<void> {
  return emTransacao(async (tx) => {
    await travar(tx, `votacao:${e.votacaoId}`)
    const v = await tx.votacao.findUniqueOrThrow({
      where: { id: e.votacaoId },
      include: { votos: true },
    })
    const outros = v.votos.some((x) => x.pessoaId !== v.convocadaPorId)
    exigir(
      v.status === 'ABERTA' &&
        v.convocadaPorId === ctx.ator.pessoaId &&
        !outros &&
        v.assunto !== 'VETO_JOGO' &&
        v.assunto !== 'CESSAO_VEZ', // a cessão se retira pela própria proposta (RN-CES-03)
      'CANCELAMENTO_NEGADO',
    ) // CA-78
    await tx.votacao.update({
      where: { id: v.id },
      data: {
        status: 'CANCELADA',
        encerradaEm: ctx.agora,
        motivoEncerramento: 'CANCELADA_PELO_CONVOCANTE',
      },
    })
    await registrarEvento(tx, ctx, {
      acao: 'votacao.cancelar',
      entidade: 'votacao',
      entidadeId: v.id,
    })
  })
}

/**
 * Tick, passo 1 (RN-VOT-04/13): apura todas as abertas, cada uma na própria transação — as
 * vencidas encerram por PRAZO e as que ficaram decididas por saída de eleitor também encerram.
 */
export async function fecharVotacoesVencidas(): Promise<{ encerradas: number; erros: string[] }> {
  const vencidas = await db.votacao.findMany({
    where: { status: 'ABERTA' },
    orderBy: { encerraEm: 'asc' },
    select: { id: true },
  })
  let encerradas = 0
  const erros: string[] = []
  for (const { id } of vencidas) {
    try {
      // eslint-disable-next-line no-await-in-loop -- ordem de encerramento define a numeração das ATAs
      const ok = await fecharVotacao(id)
      if (ok) encerradas++
    } catch (e) {
      erros.push(`votação ${id}: ${e instanceof Error ? e.message : 'erro'}`)
    }
  }
  return { encerradas, erros }
}

export { nomeDoAssunto }
