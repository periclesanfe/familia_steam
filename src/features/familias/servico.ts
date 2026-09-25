import 'server-only'

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ErroDeNegocio, exigir } from '@/domain/erros'
import { PARAMETROS_1_0, parametrosSchema, versaoVigente } from '@/domain/regulamento'
import { type DataCivil, dataLocal, paraDb, somarHoras } from '@/domain/tempo'
import { criarGenese } from '@/features/bootstrap/servico'
import { talvezIniciarVigencia } from '@/features/onboarding/servico'
import { abrirVotacao } from '@/features/votacoes/servico'
import type { ContextoAcao } from '@/server/acao'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import { dbBase, type Tx } from '@/server/db'
import { comFamilia, familiaAtual } from '@/server/familia'
import { emTransacao, travar } from '@/server/tx'

import { criarConvite } from './convite'

const DIAS_INDICACAO = 7
const ABERTOS = { status: { not: 'ENCERRADO' as const } }

/** Texto da 1.0 que toda família nova recebe (docs/regulamento, copiado para a imagem). */
const textoDoRegulamento = () =>
  readFileSync(join(process.cwd(), 'docs/regulamento/regulamento-v1.0.md'), 'utf8')

/** RN-FAM-03: a pessoa não pode ter vínculo aberto em família alguma (índice global no banco). */
async function exigirSemFamilia(pessoaId: string) {
  const p = await dbBase.pessoa.findUniqueOrThrow({
    where: { id: pessoaId },
    select: { familiaId: true },
  })
  if (!p.familiaId) return
  const aberto = await comFamilia(p.familiaId, () =>
    emTransacao((tx) => tx.membro.count({ where: { pessoaId, ...ABERTOS } })),
  )
  exigir(aberto === 0, 'ENTRADA_INVALIDA', 'Você já está numa família. Saia dela antes.')
}

/**
 * RN-FAM-02: um VISITANTE cria a família; nasce a 1.0 da família (sem vigência) e ele vira o
 * primeiro membro fundador. Criar não dá poder algum (RN-ACE-02).
 */
export async function criarFamilia(
  ctx: ContextoAcao,
  e: { nome: string; entrouNaFamiliaEm: DataCivil },
): Promise<{ familiaId: string }> {
  const eu = ctx.ator.pessoaId
  await exigirSemFamilia(eu)
  const familiaId = randomUUID()
  const texto = textoDoRegulamento()
  await dbBase.familia.create({
    data: { id: familiaId, nome: e.nome, criadaPorId: eu, criadaEm: ctx.agora },
  })
  await comFamilia(familiaId, () =>
    emTransacao(async (tx) => {
      const pessoa = await tx.pessoa.findUniqueOrThrow({
        where: { id: eu },
        select: { steamId64: true },
      })
      await tx.pessoa.update({ where: { id: eu }, data: { familiaId } })
      await tx.membro.create({
        data: { pessoaId: eu, origem: 'FUNDADOR', status: 'AGUARDANDO_ADESAO' },
      })
      await tx.integranteFamilia.create({
        data: {
          pessoaId: eu,
          steamId64: pessoa.steamId64,
          origem: 'PRE_EXISTENTE',
          status: 'ATIVO',
          entrouEm: paraDb(e.entrouNaFamiliaEm),
        },
      })
      const { versaoId } = await criarGenese(tx, texto, PARAMETROS_1_0)
      await registrarEvento(tx, ctx, {
        acao: 'familia.criar',
        entidade: 'familia',
        entidadeId: familiaId,
        dados: { depois: { nome: e.nome, versaoId } },
      })
    }),
  )
  return { familiaId }
}

/** RN-FAM-10 (D-37): o organizador é quem criou a família; só tem esse papel antes da vigência. */
async function organizadorDe(tx: Tx): Promise<string | null> {
  const familiaId = familiaAtual()
  if (!familiaId) return null
  const f = await tx.familia.findUnique({ where: { id: familiaId }, select: { criadaPorId: true } })
  return f?.criadaPorId ?? null
}

async function vigente(tx: Tx, agora: Date) {
  const versoes = await tx.versaoRegulamento.findMany({
    select: { id: true, ordem: true, vigenteDesde: true, parametros: true },
  })
  return versaoVigente(versoes, agora)
}

/**
 * RN-FAM-10 (D-37), antes da vigência: quem decide a entrada é o organizador (quem criou a
 * família). A resposta dele aprova ou recusa; as dos demais ficam registradas como opinião.
 */
async function decidirSeOrganizador(tx: Tx, ctx: Contexto, indicacaoId: string) {
  const i = await tx.indicacao.findUniqueOrThrow({
    where: { id: indicacaoId },
    include: { aprovacoes: true },
  })
  if (i.status !== 'ABERTA') return
  const organizador = await organizadorDe(tx)
  const decisao = i.aprovacoes.find((a) => a.pessoaId === organizador)
  if (!decisao) return
  await tx.indicacao.update({
    where: { id: i.id },
    data: { status: decisao.aprova ? 'APROVADA' : 'RECUSADA', encerradaEm: ctx.agora },
  })
  if (decisao.aprova) await criarConvite(tx, ctx, i.id, i.candidatoSteamId64)
}

/**
 * RN-FAM-04/05/10: um membro indica um candidato (SteamID já resolvido). Antes da vigência, a
 * indicação espera a decisão do organizador (a dele já vale como aprovação); depois, abre a
 * votação ADMISSAO_MEMBRO.
 */
export async function indicar(
  ctx: ContextoAcao,
  e: { steamId64: string; email?: string | undefined; nome: string },
): Promise<{ indicacaoId: string; votacaoId?: string }> {
  const eu = ctx.ator.pessoaId
  // candidato: Pessoa global (sem família), para sincronizar os jogos antes da decisão
  const candidato =
    (await dbBase.pessoa.findUnique({ where: { steamId64: e.steamId64 }, select: { id: true } })) ??
    (await dbBase.pessoa.create({
      data: { steamId64: e.steamId64, apelido: e.nome },
      select: { id: true },
    }))
  return emTransacao(async (tx) => {
    exigir(await tx.membro.count({ where: { pessoaId: eu, ...ABERTOS } }), 'SEM_PERMISSAO')
    exigir(candidato.id !== eu, 'ENTRADA_INVALIDA', 'Você já está na família.')
    exigir(
      (await tx.membro.count({ where: { pessoaId: candidato.id, ...ABERTOS } })) === 0,
      'ENTRADA_INVALIDA',
      'Esta pessoa já está na família.',
    )
    const aberta = await tx.indicacao.count({
      where: { candidatoSteamId64: e.steamId64, status: 'ABERTA' },
    })
    exigir(aberta === 0, 'ENTRADA_INVALIDA', 'Já existe uma indicação aberta para esta pessoa.')
    const i = await tx.indicacao.create({
      data: {
        candidatoSteamId64: e.steamId64,
        candidatoId: candidato.id,
        indicadaPorId: eu,
        email: e.email ?? null,
        criadaEm: ctx.agora,
        expiraEm: somarHoras(ctx.agora, DIAS_INDICACAO * 24),
      },
      select: { id: true },
    })
    await registrarEvento(tx, ctx, {
      acao: 'indicacao.criar',
      entidade: 'indicacao',
      entidadeId: i.id,
      dados: { depois: { steamId64: e.steamId64 } },
    })
    if (!(await vigente(tx, ctx.agora))) {
      await tx.aprovacaoIndicacao.create({
        data: { indicacaoId: i.id, pessoaId: eu, aprova: true, em: ctx.agora },
      })
      await decidirSeOrganizador(tx, ctx, i.id)
      return { indicacaoId: i.id }
    }
    // RN-FAM-05: depois da vigência vale o Regulamento (art. 6º)
    const { votacaoId, eleitoresIds } = await abrirVotacao(tx, ctx, eu, {
      assunto: 'ADMISSAO_MEMBRO',
      proposicao: `Admitir ${e.nome} no consórcio e na família`,
      justificativa: `Indicação de membro; biblioteca e perfil Steam na indicação.`,
      efeito: {
        tipo: 'ADMISSAO_MEMBRO',
        nome: e.nome.length >= 3 ? e.nome : `${e.nome} (Steam)`,
        steamId64: e.steamId64,
        incluirNaFamilia: true,
      },
    })
    exigir(eleitoresIds.includes(eu), 'SEM_PERMISSAO')
    await tx.indicacao.update({ where: { id: i.id }, data: { votacaoId } })
    return { indicacaoId: i.id, votacaoId }
  })
}

/** RN-FAM-10, antes da vigência: cada membro opina; a resposta do organizador decide. */
export async function responderIndicacao(
  ctx: ContextoAcao,
  e: { indicacaoId: string; aprova: boolean },
): Promise<void> {
  return emTransacao(async (tx) => {
    const eu = ctx.ator.pessoaId
    exigir(await tx.membro.count({ where: { pessoaId: eu, ...ABERTOS } }), 'SEM_PERMISSAO')
    const i = await tx.indicacao.findUnique({ where: { id: e.indicacaoId } })
    if (!i) throw new ErroDeNegocio('NAO_ENCONTRADO')
    exigir(
      i.status === 'ABERTA' && !i.votacaoId && ctx.agora < i.expiraEm,
      'ENTRADA_INVALIDA',
      'Esta indicação não está aberta para aprovação.',
    )
    await tx.aprovacaoIndicacao.upsert({
      where: { indicacaoId_pessoaId: { indicacaoId: i.id, pessoaId: eu } },
      create: { indicacaoId: i.id, pessoaId: eu, aprova: e.aprova, em: ctx.agora },
      update: { aprova: e.aprova, em: ctx.agora },
    })
    await registrarEvento(tx, ctx, {
      acao: e.aprova ? 'indicacao.aprovar' : 'indicacao.recusar',
      entidade: 'indicacao',
      entidadeId: i.id,
    })
    await decidirSeOrganizador(tx, ctx, i.id)
  })
}

/**
 * RN-FAM-06: o candidato aceita o convite com a própria conta Steam. Antes da vigência vira
 * fundador; depois, admitido (RN-CAD-12). O vínculo com a família Steam fica ATIVO se ele já
 * está nela, ou CONVITE_AUTORIZADO para registrar a execução depois (RN-CAD-08).
 */
export async function aceitarConvite(
  ctx: ContextoAcao,
  e: { token: string; naFamiliaSteamDesde?: DataCivil | undefined },
): Promise<void> {
  const eu = ctx.ator.pessoaId
  const [convite, pessoa] = await Promise.all([
    dbBase.convite.findUnique({ where: { token: e.token } }),
    dbBase.pessoa.findUniqueOrThrow({ where: { id: eu }, select: { steamId64: true } }),
  ])
  // outra conta, usado ou vencido: a mesma resposta, sem revelar a família (CA-184/185)
  const invalido = new ErroDeNegocio('NAO_ENCONTRADO', 'Convite inválido para esta conta Steam.')
  if (!convite) throw invalido
  if (convite.steamId64 !== pessoa.steamId64) throw invalido
  exigir(
    !convite.usadoEm && ctx.agora < convite.expiraEm,
    'ENTRADA_INVALIDA',
    'Este convite já foi usado ou venceu.',
  )
  await exigirSemFamilia(eu)
  await comFamilia(convite.familiaId, () =>
    emTransacao(async (tx) => {
      const usado = await tx.convite.updateMany({
        where: { id: convite.id, usadoEm: null },
        data: { usadoEm: ctx.agora, usadoPorId: eu },
      })
      exigir(usado.count === 1, 'ENTRADA_INVALIDA', 'Este convite já foi usado ou venceu.')
      const emVigor = await vigente(tx, ctx.agora)
      const votacao = await tx.indicacao.findUniqueOrThrow({
        where: { id: convite.indicacaoId },
        select: { votacaoId: true },
      })
      const ata = votacao.votacaoId
        ? await tx.ata.findFirst({
            where: { votacaoId: votacao.votacaoId },
            select: { numero: true },
          })
        : null
      await tx.pessoa.update({ where: { id: eu }, data: { familiaId: convite.familiaId } })
      await tx.membro.create({
        data: {
          pessoaId: eu,
          origem: emVigor ? 'ADMISSAO' : 'FUNDADOR',
          status: 'AGUARDANDO_ADESAO',
          ataAdmissaoNumero: ata?.numero ?? null,
        },
      })
      await tx.integranteFamilia.create({
        data: {
          pessoaId: eu,
          steamId64: pessoa.steamId64,
          origem: 'CONVITE',
          status: e.naFamiliaSteamDesde ? 'ATIVO' : 'CONVITE_AUTORIZADO',
          entrouEm: e.naFamiliaSteamDesde ? paraDb(e.naFamiliaSteamDesde) : null,
          ataConviteNumero: ata?.numero ?? null,
        },
      })
      await registrarEvento(tx, ctx, {
        acao: 'convite.aceitar',
        entidade: 'convite',
        entidadeId: convite.id,
      })
    }),
  )
}

/** RN-FAM-05: indicações sem decisão em 7 dias caducam (tick, por família). */
export async function caducarIndicacoes(ctx: Contexto): Promise<number> {
  return emTransacao(async (tx) => {
    const { count } = await tx.indicacao.updateMany({
      where: { status: 'ABERTA', votacaoId: null, expiraEm: { lte: ctx.agora } },
      data: { status: 'CADUCOU', encerradaEm: ctx.agora },
    })
    return count
  })
}

/**
 * RN-FAM-08, antes da vigência: sai sem efeitos de consórcio, cancela as indicações que fez e,
 * se todos os que ficam já assinaram, a 1.0 entra em vigor (RN-FAM-07). Chamar dentro da família.
 */
export async function sairAntesDaVigencia(tx: Tx, ctx: ContextoAcao): Promise<void> {
  await desvincularAntesDaVigencia(tx, ctx, ctx.ator.pessoaId)
}

/** Desfaz o vínculo antes da vigência e, se os que ficam já assinaram, a 1.0 entra em vigor. */
async function desvincularAntesDaVigencia(tx: Tx, ctx: ContextoAcao, pessoaId: string) {
  await tx.membro.updateMany({
    where: { pessoaId, ...ABERTOS },
    data: { status: 'ENCERRADO', encerradoEm: ctx.agora, motivoEncerramento: 'SAIDA_DA_FAMILIA' },
  })
  await tx.integranteFamilia.updateMany({
    where: { pessoaId, status: { in: ['ATIVO', 'CONVITE_AUTORIZADO'] } },
    data: { status: 'SAIU', saiuEm: paraDb(dataLocal(ctx.agora)) },
  })
  await tx.indicacao.updateMany({
    where: { indicadaPorId: pessoaId, status: 'ABERTA' },
    data: { status: 'CANCELADA', encerradaEm: ctx.agora },
  })
  await tx.pessoa.update({ where: { id: pessoaId }, data: { familiaId: null } })
  const v10 = await tx.versaoRegulamento.findFirst({
    where: { ordem: 0 },
    select: { id: true, sha256: true, parametros: true },
  })
  if (v10) {
    await talvezIniciarVigencia(tx, ctx, {
      ...v10,
      parametros: parametrosSchema.parse(v10.parametros),
    })
  }
}

/**
 * RN-FAM-10 (D-37): antes da vigência o organizador exclui qualquer membro da família no sistema.
 * Depois dela o papel acaba e a exclusão segue o Regulamento (arts. 30 e 35, por votação).
 */
export async function excluirAntesDaVigencia(
  ctx: ContextoAcao,
  e: { pessoaId: string },
): Promise<void> {
  return emTransacao(async (tx) => {
    await travar(tx, 'fechamento')
    exigir(
      !(await vigente(tx, ctx.agora)),
      'SEM_PERMISSAO',
      'O acordo já está em vigor: vale o Regulamento.',
    )
    exigir(
      (await organizadorDe(tx)) === ctx.ator.pessoaId,
      'SEM_PERMISSAO',
      'Só o organizador exclui antes da vigência.',
    )
    exigir(
      e.pessoaId !== ctx.ator.pessoaId,
      'ENTRADA_INVALIDA',
      'Para sair, use "Sair da família".',
    )
    exigir(await tx.membro.count({ where: { pessoaId: e.pessoaId, ...ABERTOS } }), 'NAO_ENCONTRADO')
    await desvincularAntesDaVigencia(tx, ctx, e.pessoaId)
    await registrarEvento(tx, ctx, {
      acao: 'familia.excluir',
      entidade: 'pessoa',
      entidadeId: e.pessoaId,
    })
  })
}
