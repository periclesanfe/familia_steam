import 'server-only'

import { exigir } from '@/domain/erros'
import { parametrosSchema, versaoVigente } from '@/domain/regulamento'
import { dataLocal, deDb, paraDb, somarAnos } from '@/domain/tempo'
import { sairAntesDaVigencia } from '@/features/familias/servico'
import { concluirCiclo } from '@/features/rodadas/ciclo'
import type { MotivoEncerramentoMembro } from '@/generated/prisma/enums'
import type { ContextoAcao } from '@/server/acao'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'
import { emTransacao, travar } from '@/server/tx'

const COM_SAIU_EM: readonly MotivoEncerramentoMembro[] = [
  'SAIDA_VOLUNTARIA',
  'SAIDA_DA_FAMILIA',
  'EXCLUSAO_ART30',
  'EXCLUSAO_ART35',
]

/**
 * RN-CAD-04: encerra o vínculo de membro. Os motivos de saída gravam `saiuEm` na participação do
 * ciclo em andamento ou em revisão e reavaliam a conclusão do ciclo (RN-CIC-04). Quem sai deixa
 * de ser pendente nas votações abertas (RN-VOT-04), que são apuradas de novo no próximo voto/tick.
 * Chamar com o lock 'fechamento' já tomado.
 */
export async function encerrarMembro(
  tx: Tx,
  ctx: Contexto,
  pessoaId: string,
  motivo: MotivoEncerramentoMembro,
  efetivaEm: Date = ctx.agora,
  ataNumero?: number,
): Promise<boolean> {
  const membro = await tx.membro.findFirst({ where: { pessoaId, status: { not: 'ENCERRADO' } } })
  if (!membro) return false
  await tx.membro.update({
    where: { id: membro.id },
    data: {
      status: 'ENCERRADO',
      encerradoEm: efetivaEm,
      motivoEncerramento: motivo,
      ataEncerramentoNumero: ataNumero ?? null,
    },
  })
  if (COM_SAIU_EM.includes(motivo)) {
    const participacao = await tx.participacaoCiclo.findFirst({
      where: { pessoaId, saiuEm: null, ciclo: { status: { in: ['EM_ANDAMENTO', 'EM_REVISAO'] } } },
      select: { id: true, cicloId: true },
    })
    if (participacao) {
      await tx.participacaoCiclo.update({
        where: { id: participacao.id },
        data: { saiuEm: efetivaEm },
      })
      await reavaliarConclusao(tx, ctx, participacao.cicloId)
    }
  }
  await registrarEvento(tx, ctx, {
    acao: 'membro.encerrar',
    entidade: 'membro',
    entidadeId: membro.id,
    dados: { depois: { motivo, efetivaEm } },
    ...(ataNumero ? { ataNumero } : {}),
  })
  return true
}

/** RN-CIC-04: com a saída do último não contemplado, o ciclo em andamento conclui. */
async function reavaliarConclusao(tx: Tx, ctx: Contexto, cicloId: string) {
  const ciclo = await tx.ciclo.findUniqueOrThrow({ where: { id: cicloId } })
  if (ciclo.status !== 'EM_ANDAMENTO') return
  const [ativos, contemplados] = await Promise.all([
    tx.participacaoCiclo.findMany({ where: { cicloId, saiuEm: null }, select: { pessoaId: true } }),
    tx.rodada.findMany({
      where: { cicloId, contempladoId: { not: null }, status: { notIn: ['ANULADA', 'CANCELADA'] } },
      select: { contempladoId: true },
    }),
  ])
  const ja = new Set(contemplados.map((r) => r.contempladoId))
  if (ativos.some((p) => !ja.has(p.pessoaId))) return
  const versoes = await tx.versaoRegulamento.findMany({
    select: { ordem: true, vigenteDesde: true, parametros: true },
  })
  const p = parametrosSchema.parse(versaoVigente(versoes, ctx.agora)?.parametros)
  await concluirCiclo(tx, ctx, ciclo, p)
}

/** RN-CAD-10/11: vínculo de integrante sai; vaga bloqueada por 1 ano da entrada (D-30). */
export async function registrarSaidaDaFamilia(
  tx: Tx,
  ctx: Contexto,
  pessoaId: string,
  efetivaEm: Date,
) {
  const integrante = await tx.integranteFamilia.findFirst({ where: { pessoaId, status: 'ATIVO' } })
  if (!integrante) return
  const saiu = dataLocal(efetivaEm)
  const bloqueio = somarAnos(integrante.entrouEm ? deDb(integrante.entrouEm) : saiu, 1)
  await tx.integranteFamilia.update({
    where: { id: integrante.id },
    data: {
      status: 'SAIU',
      saiuEm: paraDb(saiu),
      vagaBloqueadaAte: bloqueio > saiu ? paraDb(bloqueio) : null,
    },
  })
  await registrarEvento(tx, ctx, {
    acao: 'integrante.sair',
    entidade: 'integrante_familia',
    entidadeId: integrante.id,
    dados: { depois: { saiuEm: saiu, vagaBloqueadaAte: bloqueio > saiu ? bloqueio : null } },
  })
}

async function declarar(
  tx: Tx,
  ctx: ContextoAcao,
  tipo: 'SAIDA_CONSORCIO' | 'SAIDA_FAMILIA' | 'IMPOSSIBILIDADE_PAGAMENTO',
) {
  const d = await tx.declaracao.create({
    data: {
      tipo,
      pessoaId: ctx.ator.pessoaId,
      efetivaEm: ctx.agora,
      registradaEm: ctx.agora,
      registradaPorId: ctx.ator.pessoaId,
    },
    select: { id: true },
  })
  await registrarEvento(tx, ctx, {
    acao: `declaracao.${tipo.toLowerCase()}`,
    entidade: 'declaracao',
    entidadeId: d.id,
  })
}

/** RN-SAI-01/02/03: saída voluntária do consórcio (não sai da família). */
export async function sairDoConsorcio(ctx: ContextoAcao) {
  return emTransacao(async (tx) => {
    await travar(tx, 'fechamento')
    exigir(ctx.perfil.perfil === 'MEMBRO' || ctx.perfil.perfil === 'PENDENTE', 'SEM_PERMISSAO')
    await declarar(tx, ctx, 'SAIDA_CONSORCIO')
    await encerrarMembro(tx, ctx, ctx.ator.pessoaId, 'SAIDA_VOLUNTARIA')
  })
}

/**
 * RN-CAD-10: saída da Família Steam; quem é membro sai do consórcio junto. Antes da vigência
 * não há consórcio: a saída só desfaz o vínculo (RN-FAM-08).
 */
export async function sairDaFamilia(ctx: ContextoAcao) {
  return emTransacao(async (tx) => {
    await travar(tx, 'fechamento')
    const vigente = await tx.versaoRegulamento.count({
      where: { vigenteDesde: { lte: ctx.agora } },
    })
    await registrarSaidaDaFamilia(tx, ctx, ctx.ator.pessoaId, ctx.agora)
    if (vigente === 0) {
      await sairAntesDaVigencia(tx, ctx)
      return
    }
    await declarar(tx, ctx, 'SAIDA_FAMILIA')
    await encerrarMembro(tx, ctx, ctx.ator.pessoaId, 'SAIDA_DA_FAMILIA')
  })
}

/** RN-SAI-06.1: autodeclaração própria → IMPOSSIBILITADO na hora (fora dos sorteios seguintes). */
export async function declararImpossibilidade(ctx: ContextoAcao) {
  return emTransacao(async (tx) => {
    const m = await tx.membro.findFirst({ where: { pessoaId: ctx.ator.pessoaId, status: 'ATIVO' } })
    exigir(m, 'ENTRADA_INVALIDA', 'Só um membro ativo declara impossibilidade.', 'art. 30')
    await declarar(tx, ctx, 'IMPOSSIBILIDADE_PAGAMENTO')
    await tx.membro.update({
      where: { id: m.id },
      data: { status: 'IMPOSSIBILITADO', impossibilitadoDesde: ctx.agora },
    })
    await registrarEvento(tx, ctx, {
      acao: 'membro.impossibilitar',
      entidade: 'membro',
      entidadeId: m.id,
    })
  })
}
