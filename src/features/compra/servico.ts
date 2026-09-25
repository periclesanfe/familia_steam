import 'server-only'

import {
  type AppLoja,
  aquisicaoAtiva,
  appsDoProduto,
  bloqueia,
  classificarAquisicao,
  exige16IV,
  type FatosAviso,
  type Regra,
  statusAviso,
  type Validacao,
  validarProduto,
} from '@/domain/compra'
import { efeitoSchema } from '@/domain/efeitos'
import { ErroDeNegocio, exigir } from '@/domain/erros'
import { complementar, gasto } from '@/domain/financeiro'
import { parametrosSchema } from '@/domain/regulamento'
import { somarHoras } from '@/domain/tempo'
import { buscarDetalhes } from '@/features/steam/sync'
import type { OrigemNaLista, OrigemProduto, TipoProduto } from '@/generated/prisma/enums'
import type { ContextoAcao } from '@/server/acao'
import { registrarEvento } from '@/server/auditoria'
import { db, type Tx } from '@/server/db'
import { emTransacao, travar } from '@/server/tx'

import { criarSobra, fecharRodada, premioDaRodada, ratearSobra } from './fechamento'

const UMA_HORA = 3_600_000
const APTOS = ['ATIVO', 'IMPOSSIBILITADO'] as const

/** Votações ligadas ao aviso (veto e 16 IV) e o status derivado (RN-COM-05). */
export async function fatosDoAviso(tx: Tx, avisoId: string, agora: Date) {
  const aviso = await tx.avisoCompra.findUniqueOrThrow({
    where: { id: avisoId },
    include: {
      rodada: { select: { prazoCompraAte: true } },
      aquisicoes: { select: { valorCentavos: true, reembolsoValorCentavos: true } },
    },
  })
  const votacoes = await tx.votacao.findMany({
    where: { chaveObjeto: `aviso:${avisoId}`, status: { not: 'CANCELADA' } },
    select: { assunto: true, status: true, encerradaEm: true },
    orderBy: { abertaEm: 'asc' },
  })
  const veto = votacoes.find((v) => v.assunto === 'VETO_JOGO') ?? null
  const fatos: FatosAviso = {
    substituidoEm: aviso.substituidoEm,
    janelaVetoAte: aviso.janelaVetoAte,
    prazoCompraAte: aviso.rodada.prazoCompraAte ?? aviso.janelaVetoAte,
    aquisicoesAtivas: aviso.aquisicoes.filter(aquisicaoAtiva).length,
    veto,
    votacoes16IV: votacoes.filter((v) => v.assunto === 'JOGO_DE_OUTRO_MEMBRO'),
    exige16IV: exige16IV(aviso.validacoes as Validacao[], aviso.declarantesPosseIds),
  }
  return { aviso, fatos, ...statusAviso(fatos, agora) }
}

/** Dados para as validações V1–V12, lidos do cache (RN-COM-04, RN-STM-10). */
async function entradaDeValidacao(
  tx: Tx,
  produto: { tipo: TipoProduto; appId: number; appIdsIncluidos: number[]; nome: string },
  contempladoId: string,
  janelaVetoAte: Date,
  prazoCompraAte: Date,
  agora: Date,
) {
  const apps = appsDoProduto(produto)
  const [cache, bloqueios, votacoesAdulto, contemplado, outros] = await Promise.all([
    tx.steamApp.findMany({ where: { appId: { in: apps } } }),
    tx.jogoBloqueado.findMany({
      where: { tipo: 'JOGO', excluidoEm: null },
      select: { appIds: true },
    }),
    tx.votacao.findMany({
      where: { status: 'APROVADA', chaveObjeto: { startsWith: 'DESBLOQUEAR_CONTEUDO_ADULTO:' } },
      select: { efeito: true },
    }),
    tx.pessoa.findUniqueOrThrow({
      where: { id: contempladoId },
      select: {
        steamJogosPublicos: true,
        jogos: { where: { appId: { in: apps } }, select: { appId: true } },
      },
    }),
    tx.pessoa.findMany({
      where: { id: { not: contempladoId }, membros: { some: { status: { in: [...APTOS] } } } },
      select: {
        apelido: true,
        steamJogosPublicos: true,
        jogos: { where: { appId: { in: apps } }, select: { appId: true } },
      },
    }),
  ])
  const bases = cache.flatMap((a) => (a.jogoBaseAppId ? [a.jogoBaseAppId] : []))
  const cacheBases =
    bases.length > 0 ? await tx.steamApp.findMany({ where: { appId: { in: bases } } }) : []
  const loja = new Map<number, AppLoja>(
    [...cache, ...cacheBases].map((a) => [
      a.appId,
      a.sucesso
        ? {
            tipo: a.tipo ?? '',
            gratuito: a.gratuito ?? false,
            nome: a.nome ?? '',
            categorias: a.categorias,
            descritores: a.descritoresConteudo,
            jogoBaseAppId: a.jogoBaseAppId,
            emBreve: a.emBreve ?? false,
          }
        : null,
    ]),
  )
  const desbloqueados = votacoesAdulto.flatMap((v) => {
    const e = efeitoSchema.safeParse(v.efeito)
    return e.success && e.data.tipo === 'DESBLOQUEAR_CONTEUDO_ADULTO' ? [e.data.appId] : []
  })
  return validarProduto({
    produto,
    loja,
    bloqueados: new Set(bloqueios.flatMap((b) => b.appIds)),
    desbloqueadosAdulto: new Set(desbloqueados),
    // V9/V10 não usam o snapshot de quem está com a biblioteca privada (RN-COM-04)
    bibliotecaContemplado: contemplado.steamJogosPublicos
      ? new Set(contemplado.jogos.map((j) => j.appId))
      : null,
    outros: outros.map((o) => ({
      apelido: o.apelido,
      biblioteca: o.steamJogosPublicos ? new Set(o.jogos.map((j) => j.appId)) : null,
    })),
    janelaVetoAte,
    prazoCompraAte,
    agora,
  })
}

/** RN-COM-02: de onde veio o jogo escolhido (informativo, não bloqueia). */
async function origemNaLista(
  tx: Tx,
  contempladoId: string,
  appId: number,
  executadaEm: Date | null,
): Promise<OrigemNaLista> {
  const itens = await tx.itemListaDesejos.findMany({
    where: { appId, pessoa: { membros: { some: {} } } }, // só listas da família (15 §3)
    select: { pessoaId: true, adicionadoEm: true },
  })
  const meu = itens.find((i) => i.pessoaId === contempladoId)
  if (meu)
    return executadaEm && meu.adicionadoEm < executadaEm
      ? 'LISTA_DO_SORTEADO'
      : 'INCLUIDO_APOS_SORTEIO'
  return itens.length > 0 ? 'LISTA_DE_OUTRO_MEMBRO' : 'FORA_DAS_LISTAS'
}

export type DadosAviso = {
  rodadaId: string
  appId: number
  tipo: TipoProduto
  origem: OrigemProduto
  lojaExterna?: string | undefined
  pacoteId?: number | undefined
  appIdsIncluidos: number[]
  nome: string
  precoReferenciaCentavos?: number | undefined
  declaracoes: Partial<Record<Regra, string>>
  evidenciaAnexoId?: string | undefined
}

/**
 * RN-COM-03/04: aviso prévio do contemplado vigente. Detalhes da loja atualizados antes (até 10
 * apps com cache > 1 h, fora da transação); bloqueio impede; alertas exigem declaração (e
 * evidência); o novo aviso substitui o anterior, cujo veto segue (CA-64).
 */
export async function avisar(
  ctx: ContextoAcao,
  e: DadosAviso,
): Promise<{ avisoId: string; validacoes: Validacao[] }> {
  const apps = appsDoProduto({ ...e })
  const antigos = await db.steamApp.findMany({
    where: { appId: { in: apps }, detalhesEm: { gte: new Date(ctx.agora.getTime() - UMA_HORA) } },
    select: { appId: true },
  })
  const vencidos = apps.filter((id) => !antigos.some((a) => a.appId === id)).slice(0, 10)
  if (vencidos.length > 0) await buscarDetalhes(vencidos, undefined, () => Promise.resolve())

  return emTransacao(async (tx) => {
    await travar(tx, `rodada:${e.rodadaId}`)
    const r = await tx.rodada.findUniqueOrThrow({
      where: { id: e.rodadaId },
      include: {
        versaoRegulamento: { select: { parametros: true } },
        cessoes: {
          where: { status: { in: ['AGUARDANDO_ACEITE', 'EM_VOTACAO'] } },
          select: { id: true },
        },
      },
    })
    exigir(
      r.contempladoId === ctx.ator.pessoaId,
      'SEM_PERMISSAO',
      'Só o contemplado avisa o jogo.',
      'art. 22',
    )
    exigir(
      r.status === 'CONTEMPLADA' && r.prazoCompraAte && ctx.agora < r.prazoCompraAte,
      'AVISO_INDISPONIVEL',
    )
    exigir(
      r.cessoes.length === 0,
      'AVISO_INDISPONIVEL',
      'Há uma cessão em andamento nesta rodada.',
      'art. 13',
    )
    const p = parametrosSchema.parse(r.versaoRegulamento?.parametros)
    const janelaVetoAte = somarHoras(ctx.agora, p.horasJanelaVeto)

    const validacoes = await entradaDeValidacao(
      tx,
      e,
      r.contempladoId,
      janelaVetoAte,
      r.prazoCompraAte,
      ctx.agora,
    )
    const bloqueio = validacoes.find((v) => v.resultado === 'BLOQUEIO')
    if (bloqueia(validacoes))
      throw new ErroDeNegocio('PRODUTO_BLOQUEADO', bloqueio?.mensagem, bloqueio?.artigo)
    const faltam = validacoes.filter(
      (v) => v.exige !== 'NENHUMA' && !e.declaracoes[v.regra]?.trim(),
    )
    exigir(
      faltam.length === 0,
      'DECLARACAO_OBRIGATORIA',
      `Falta declarar: ${faltam.map((v) => v.regra).join(', ')}.`,
    )
    const precisaEvidencia = validacoes.some((v) => v.exige === 'DECLARACAO_E_EVIDENCIA')
    if (precisaEvidencia) {
      exigir(
        e.evidenciaAnexoId,
        'DECLARACAO_OBRIGATORIA',
        'Anexe a evidência (print da loja ou da biblioteca).',
      )
      const a = await tx.anexo.findUnique({ where: { id: e.evidenciaAnexoId } })
      exigir(a?.enviadoPorId === ctx.ator.pessoaId && a.entidadeId === null, 'SEM_PERMISSAO')
    }

    await tx.avisoCompra.updateMany({
      where: { rodadaId: r.id, substituidoEm: null },
      data: { substituidoEm: ctx.agora },
    })
    const aviso = await tx.avisoCompra.create({
      data: {
        rodadaId: r.id,
        contempladoId: r.contempladoId,
        appId: e.appId,
        pacoteId: e.pacoteId ?? null,
        appIdsIncluidos: e.tipo === 'PACOTE' ? e.appIdsIncluidos : [],
        nome: e.nome,
        tipo: e.tipo,
        origem: e.origem,
        lojaExterna: e.origem === 'CHAVE_EXTERNA' ? (e.lojaExterna ?? null) : null,
        precoReferenciaCentavos: e.precoReferenciaCentavos ?? null,
        origemNaLista: await origemNaLista(tx, r.contempladoId, e.appId, r.executadaEm),
        validacoes,
        declaracoes: Object.entries(e.declaracoes).map(([regra, texto]) => ({
          regra,
          texto,
          evidenciaAnexoId: e.evidenciaAnexoId ?? null,
        })),
        snapshotSteam: await tx.steamApp.findMany({
          where: { appId: { in: apps } },
          omit: { prioridadeSync: true },
        }),
        avisadoEm: ctx.agora,
        janelaVetoAte,
      },
      select: { id: true },
    })
    if (e.evidenciaAnexoId) {
      await tx.anexo.update({
        where: { id: e.evidenciaAnexoId },
        data: { entidade: 'aviso', entidadeId: aviso.id },
      })
    }
    await tx.steamApp.updateMany({ where: { appId: { in: apps } }, data: { prioridadeSync: 3 } })
    await registrarEvento(tx, ctx, {
      acao: 'aviso.criar',
      entidade: 'aviso_compra',
      entidadeId: aviso.id,
      dados: {
        depois: {
          appId: e.appId,
          nome: e.nome,
          janelaVetoAte,
          alertas: validacoes.filter((v) => v.resultado !== 'OK').length,
        },
      },
    })
    return { avisoId: aviso.id, validacoes }
  })
}

/** RN-COM-07: "eu tenho este jogo" — qualquer outro membro, antes da autorização; retirável. */
export async function declararPosse(ctx: ContextoAcao, e: { avisoId: string; retirar?: boolean }) {
  return emTransacao(async (tx) => {
    const { aviso, status } = await fatosDoAviso(tx, e.avisoId, ctx.agora)
    await travar(tx, `rodada:${aviso.rodadaId}`)
    exigir(
      aviso.contempladoId !== ctx.ator.pessoaId,
      'SEM_PERMISSAO',
      'O contemplado responde pela V9.',
    )
    exigir(
      ['JANELA_VETO', 'EM_VOTACAO_VETO', 'AGUARDANDO_16IV'].includes(status),
      'ENTRADA_INVALIDA',
      'Só antes da autorização da compra.',
      'art. 16, IV',
    )
    const outros = aviso.declarantesPosseIds.filter((id) => id !== ctx.ator.pessoaId)
    await tx.avisoCompra.update({
      where: { id: aviso.id },
      data: { declarantesPosseIds: e.retirar ? outros : [...outros, ctx.ator.pessoaId] },
    })
    await registrarEvento(tx, ctx, {
      acao: e.retirar ? 'aviso.retirar_posse' : 'aviso.declarar_posse',
      entidade: 'aviso_compra',
      entidadeId: aviso.id,
    })
  })
}

export type DadosCompra = {
  rodadaId: string
  avisoId?: string | undefined
  appId: number
  nome: string
  compradaEm: Date
  valorCentavos: number
  comprovanteId: string
  contaSteamId64: string
  preVenda: boolean
}

/**
 * RN-COM-09: só o contemplado vigente registra; compra anterior ao sorteio é recusada (CA-69);
 * a irregular é gravada mesmo assim, com as marcas (D-10). Com APOS_PRAZO, tenta fechar (b).
 */
export async function registrarCompra(
  ctx: ContextoAcao,
  e: DadosCompra,
): Promise<{ aquisicaoId: string }> {
  return emTransacao(async (tx) => {
    await travar(tx, 'fechamento')
    await travar(tx, `rodada:${e.rodadaId}`)
    const r = await tx.rodada.findUniqueOrThrow({
      where: { id: e.rodadaId },
      include: {
        aquisicoes: { select: { valorCentavos: true, reembolsoValorCentavos: true } },
        cessoes: {
          where: { status: { in: ['AGUARDANDO_ACEITE', 'EM_VOTACAO'] } },
          select: { id: true, status: true },
        },
        contemplado: {
          select: {
            steamId64: true,
            integrantes: { where: { status: 'ATIVO' }, select: { id: true } },
          },
        },
      },
    })
    exigir(
      r.contempladoId === ctx.ator.pessoaId,
      'SEM_PERMISSAO',
      'Só o contemplado registra a compra.',
      'art. 20',
    )
    exigir(r.status === 'CONTEMPLADA', 'COMPRA_RECUSADA', 'A rodada não está aberta para compra.')
    exigir(
      r.executadaEm && e.compradaEm >= r.executadaEm,
      'COMPRA_RECUSADA',
      'Compra anterior ao sorteio.',
      'art. 19, I',
    )
    exigir(
      e.compradaEm <= ctx.agora,
      'ENTRADA_INVALIDA',
      'A data da compra não pode estar no futuro.',
    )
    exigir(
      (r.contemplado?.integrantes.length ?? 0) > 0,
      'COMPRA_RECUSADA',
      'O contemplado não está na Família Steam: é caso omisso (RN-COM-14).',
      'art. 16, I',
    )
    const comprovante = await tx.anexo.findUnique({ where: { id: e.comprovanteId } })
    exigir(
      comprovante?.enviadoPorId === ctx.ator.pessoaId && comprovante.entidadeId === null,
      'SEM_PERMISSAO',
    )

    const aviso = e.avisoId ? await fatosDoAviso(tx, e.avisoId, e.compradaEm) : null
    exigir(
      !aviso || aviso.aviso.rodadaId === r.id,
      'ENTRADA_INVALIDA',
      'O aviso é de outra rodada.',
    )
    const vetoAberto = aviso?.fatos.veto?.status === 'ABERTA'
    const bloqueado = await tx.jogoBloqueado.count({
      where: { tipo: 'JOGO', excluidoEm: null, appIds: { has: e.appId } },
    })
    const irregularidades = classificarAquisicao({
      compradaEm: e.compradaEm,
      prazoCompraAte: r.prazoCompraAte ?? e.compradaEm,
      aviso: aviso && {
        appId: aviso.aviso.appId,
        appIdsIncluidos: aviso.aviso.appIdsIncluidos,
        autorizadoEm: aviso.autorizadoEm,
        status: aviso.status,
        exige16IV: aviso.fatos.exige16IV,
        aprovado16IV: aviso.fatos.votacoes16IV.some((v) => v.status === 'APROVADA'),
      },
      appId: e.appId,
      vetoAberto,
      cessaoEmVotacao: r.cessoes.some((c) => c.status === 'EM_VOTACAO'),
      bloqueadoNoAnexoI: bloqueado > 0,
      outrasAtivas: r.aquisicoes.filter(aquisicaoAtiva).length,
      multiplasPermitidas: r.multiplasAquisicoesAtaNumero !== null,
      contaSteamId64: e.contaSteamId64,
      steamIdContemplado: r.contemplado?.steamId64 ?? null,
    })
    const a = await tx.aquisicao.create({
      data: {
        rodadaId: r.id,
        avisoId: e.avisoId ?? null,
        appId: e.appId,
        nome: e.nome,
        compradaEm: e.compradaEm,
        valorCentavos: e.valorCentavos,
        comprovanteId: e.comprovanteId,
        contaSteamId64: e.contaSteamId64,
        preVenda: e.preVenda,
        irregularidades,
        registradaPorId: ctx.ator.pessoaId,
        registradaEm: ctx.agora,
      },
      select: { id: true },
    })
    await tx.anexo.update({
      where: { id: e.comprovanteId },
      data: { entidade: 'aquisicao', entidadeId: a.id },
    })
    // RN-CES-03: compra registrada com cessão aguardando aceite cancela a cessão
    await tx.cessao.updateMany({
      where: { rodadaId: r.id, status: 'AGUARDANDO_ACEITE' },
      data: { status: 'CANCELADA' },
    })
    await registrarEvento(tx, ctx, {
      acao: 'aquisicao.registrar',
      entidade: 'aquisicao',
      entidadeId: a.id,
      dados: { depois: { appId: e.appId, valorCentavos: e.valorCentavos, irregularidades } },
    })
    if (irregularidades.includes('APOS_PRAZO')) await fecharRodada(tx, ctx, r.id)
    return { aquisicaoId: a.id }
  })
}

/** RN-FIN-13 (a): "aquisição concluída" — fecha, ou aguarda a anterior. */
export async function concluirAquisicao(ctx: ContextoAcao, e: { rodadaId: string }) {
  return emTransacao(async (tx) => {
    await travar(tx, 'fechamento')
    await travar(tx, `rodada:${e.rodadaId}`)
    const r = await tx.rodada.findUniqueOrThrow({
      where: { id: e.rodadaId },
      include: { aquisicoes: { select: { valorCentavos: true, reembolsoValorCentavos: true } } },
    })
    exigir(r.contempladoId === ctx.ator.pessoaId, 'SEM_PERMISSAO')
    exigir(
      r.aquisicoes.some(aquisicaoAtiva),
      'ENTRADA_INVALIDA',
      'Registre a compra antes de concluir.',
    )
    return fecharRodada(tx, ctx, r.id, 'AQUISICAO_CONCLUIDA')
  })
}

/** RN-COM-12 (b) / RN-FIN-13 (c): depois de um reembolso, transfere o prêmio restante como SOBRA. */
export async function transferirComoSobra(ctx: ContextoAcao, e: { rodadaId: string }) {
  return emTransacao(async (tx) => {
    await travar(tx, 'fechamento')
    await travar(tx, `rodada:${e.rodadaId}`)
    const r = await tx.rodada.findUniqueOrThrow({
      where: { id: e.rodadaId },
      include: { aquisicoes: { select: { reembolsoValorCentavos: true } } },
    })
    exigir(r.contempladoId === ctx.ator.pessoaId, 'SEM_PERMISSAO')
    exigir(
      r.aquisicoes.some((a) => a.reembolsoValorCentavos !== null),
      'ENTRADA_INVALIDA',
      'Só depois de um reembolso.',
      'art. 26',
    )
    exigir(
      r.prazoCompraAte && ctx.agora < r.prazoCompraAte,
      'ENTRADA_INVALIDA',
      'O prazo de compra já venceu.',
      'art. 20',
    )
    return fecharRodada(tx, ctx, r.id, 'TRANSFERIDO_COMO_SOBRA')
  })
}

/**
 * RN-COM-12 / RN-FIN-13 (reabertura) / RN-FIN-16 (complementar): o contemplado registra o
 * reembolso. Rodada fechada reabre se o reembolso veio no prazo e a SOBRA não foi paga nem
 * consumida; senão, a diferença vira SOBRA complementar.
 */
export async function registrarReembolso(
  ctx: ContextoAcao,
  e: { aquisicaoId: string; valorCentavos: number; reembolsadaEm: Date; comprovanteId: string },
) {
  return emTransacao(async (tx) => {
    const previa = await tx.aquisicao.findUniqueOrThrow({
      where: { id: e.aquisicaoId },
      select: { rodadaId: true },
    })
    await travar(tx, 'fechamento')
    await travar(tx, `rodada:${previa.rodadaId}`)
    const a = await tx.aquisicao.findUniqueOrThrow({
      where: { id: e.aquisicaoId },
      include: { rodada: true },
    })
    const r = a.rodada
    exigir(
      r.contempladoId === ctx.ator.pessoaId,
      'SEM_PERMISSAO',
      'Só o contemplado registra o reembolso.',
    )
    exigir(a.reembolsoValorCentavos === null, 'ENTRADA_INVALIDA', 'O reembolso já foi registrado.')
    exigir(
      e.valorCentavos > 0 && e.valorCentavos <= a.valorCentavos,
      'ENTRADA_INVALIDA',
      'Valor maior que o da compra.',
    )
    const comprovante = await tx.anexo.findUnique({ where: { id: e.comprovanteId } })
    exigir(
      comprovante?.enviadoPorId === ctx.ator.pessoaId && comprovante.entidadeId === null,
      'SEM_PERMISSAO',
    )
    await tx.aquisicao.update({
      where: { id: a.id },
      data: {
        reembolsoValorCentavos: e.valorCentavos,
        reembolsadaEm: e.reembolsadaEm,
        reembolsoRegistradoEm: ctx.agora,
        reembolsoComprovanteId: e.comprovanteId,
      },
    })
    await tx.anexo.update({
      where: { id: e.comprovanteId },
      data: { entidade: 'aquisicao', entidadeId: a.id },
    })
    await registrarEvento(tx, ctx, {
      acao: 'aquisicao.reembolso',
      entidade: 'aquisicao',
      entidadeId: a.id,
      dados: { depois: { valorCentavos: e.valorCentavos } },
    })
    if (r.status !== 'FECHADA') return 'REGISTRADO' as const

    if (r.prazoCompraAte && ctx.agora < r.prazoCompraAte && (await podeReabrir(tx, r.id))) {
      await tx.obrigacao.updateMany({
        where: {
          tipo: 'SOBRA',
          rodadaOrigemId: r.id,
          aquisicaoReembolsoId: null,
          canceladaEm: null,
        },
        data: { canceladaEm: ctx.agora, motivoCancelamento: 'reabertura' },
      })
      await tx.rodada.update({
        where: { id: r.id },
        data: {
          status: 'CONTEMPLADA',
          fechamentoSolicitado: null,
          fechamentoSolicitadoEm: null,
          fechadaEm: null,
          motivoFechamento: null,
          gastoCentavos: null,
          sobraCentavos: null,
        },
      })
      await registrarEvento(tx, ctx, {
        acao: 'rodada.reabrir',
        entidade: 'rodada',
        entidadeId: r.id,
      })
      return 'REABERTA' as const
    }

    // RN-FIN-16: complementar sem recálculo em cascata
    const [aquisicoes, outras] = await Promise.all([
      tx.aquisicao.findMany({
        where: { rodadaId: r.id },
        select: { valorCentavos: true, reembolsoValorCentavos: true },
      }),
      tx.aquisicao.aggregate({
        where: { rodadaId: r.id, id: { not: a.id } },
        _sum: { complementarCentavos: true },
      }),
    ])
    const valor = complementar({
      premioCentavos: await premioDaRodada(tx, r.id),
      gastoNovoCentavos: gasto(aquisicoes),
      sobraCentavos: r.sobraCentavos ?? 0,
      outrasComplementares: outras._sum.complementarCentavos ?? 0,
    })
    await tx.aquisicao.update({ where: { id: a.id }, data: { complementarCentavos: valor } })
    if (valor > 0 && r.contempladoId) {
      const destino = await tx.rodada.findFirst({
        where: { status: 'CONTEMPLADA', contempladoId: { not: null } },
        orderBy: [{ ciclo: { numero: 'desc' } }, { sequencia: 'desc' }],
        select: { id: true, contempladoId: true, dataSorteio: true },
      })
      const ciclo = await tx.ciclo.findUniqueOrThrow({
        where: { id: r.cicloId },
        select: { status: true, semCicloSeguinte: true },
      })
      const origem = { id: r.id, cicloId: r.cicloId, contempladoId: r.contempladoId }
      if (ciclo.status === 'ENCERRADO' && ciclo.semCicloSeguinte) {
        await ratearSobra(tx, ctx, origem, valor, a.id)
      } else if (destino?.contempladoId) {
        await criarSobra(
          tx,
          ctx,
          origem,
          { ...destino, contempladoId: destino.contempladoId },
          valor,
          a.id,
        )
      } // sem destino: pendente, nasce na próxima contemplação (RN-SOR-10.3)
    }
    return 'COMPLEMENTAR' as const
  })
}

/** RN-FIN-13, reabertura: sem rateio, SOBRA sem pagamento que conta e destino não fechada. */
async function podeReabrir(tx: Tx, rodadaId: string): Promise<boolean> {
  const [rateios, sobraPrincipal] = await Promise.all([
    tx.obrigacao.count({
      where: { tipo: 'RATEIO_SOBRA', rodadaOrigemId: rodadaId, canceladaEm: null },
    }),
    tx.obrigacao.findFirst({
      where: {
        tipo: 'SOBRA',
        rodadaOrigemId: rodadaId,
        aquisicaoReembolsoId: null,
        canceladaEm: null,
      },
      select: {
        rodada: { select: { status: true } },
        pagamentos: { select: { status: true, formaDiversa: true } },
      },
    }),
  ])
  if (rateios > 0) return false
  if (!sobraPrincipal) return true
  const paga = sobraPrincipal.pagamentos.some((p) =>
    p.formaDiversa ? p.status === 'CONFIRMADO' : p.status !== 'INVALIDADO',
  )
  return !paga && sobraPrincipal.rodada.status !== 'FECHADA'
}
