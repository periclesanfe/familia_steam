import 'server-only'

import type { Efeito } from '@/domain/efeitos'
import { encerrarMembro } from '@/features/saidas/servico'
import { type Contexto, registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'

type EfeitoDe<T extends Efeito['tipo']> = Extract<Efeito, { tipo: T }>
const naoAplicavel = (motivo: string) => `não aplicável: ${motivo}`

/** Pessoa pelo SteamID (RN-CAD-01/03): reaproveita o cadastro de ex-membro ou integrante. */
async function pessoaDoSteam(tx: Tx, steamId64: string, nome: string | null, apelido: string) {
  const ja = await tx.pessoa.findUnique({ where: { steamId64 }, select: { id: true } })
  if (ja) return ja.id
  const p = await tx.pessoa.create({ data: { steamId64, nome, apelido }, select: { id: true } })
  return p.id
}

/**
 * RN-CAD-12.1/2 (art. 6º): cria o Membro AGUARDANDO_ADESAO (o SteamID passa a poder entrar) e,
 * se pedido, o convite da família pela mesma ATA (art. 7º).
 */
export async function aplicarAdmissao(
  tx: Tx,
  ctx: Contexto,
  e: EfeitoDe<'ADMISSAO_MEMBRO'>,
  ataNumero: number,
): Promise<string> {
  const pessoaId = await pessoaDoSteam(tx, e.steamId64, e.nome, e.nome.split(' ')[0] ?? e.nome)
  const aberto = await tx.membro.count({ where: { pessoaId, status: { not: 'ENCERRADO' } } })
  if (aberto > 0) return naoAplicavel('a pessoa já tem vínculo de membro aberto') // CA-95
  const m = await tx.membro.create({
    data: {
      pessoaId,
      origem: 'ADMISSAO',
      status: 'AGUARDANDO_ADESAO',
      ataAdmissaoNumero: ataNumero,
    },
    select: { id: true },
  })
  const integrante = await tx.integranteFamilia.count({
    where: { pessoaId, status: { in: ['ATIVO', 'CONVITE_AUTORIZADO'] } },
  })
  if (e.incluirNaFamilia && integrante === 0) {
    await tx.integranteFamilia.create({
      data: {
        pessoaId,
        steamId64: e.steamId64,
        origem: 'CONVITE',
        status: 'CONVITE_AUTORIZADO',
        ataConviteNumero: ataNumero,
      },
    })
  }
  await registrarEvento(tx, ctx, {
    acao: 'efeito.admissao_membro',
    entidade: 'membro',
    entidadeId: m.id,
    dados: { depois: { pessoaId, incluirNaFamilia: e.incluirNaFamilia } },
    ataNumero,
  })
  return `aplicado: ${e.nome} admitido; entra com a Steam, assina e participa a partir do próximo ciclo`
}

/** RN-CAD-08 (art. 7º): convite autorizado; a execução na Steam é registrada depois. */
export async function aplicarConvite(
  tx: Tx,
  ctx: Contexto,
  e: EfeitoDe<'CONVITE_INTEGRANTE'>,
  ataNumero: number,
): Promise<string> {
  const pessoaId =
    e.pessoaId ??
    (e.steamId64
      ? await pessoaDoSteam(tx, e.steamId64, null, e.apelido)
      : (await tx.pessoa.create({ data: { apelido: e.apelido }, select: { id: true } })).id)
  const ja = await tx.integranteFamilia.count({
    where: { pessoaId, status: { in: ['ATIVO', 'CONVITE_AUTORIZADO'] } },
  })
  if (ja > 0) return naoAplicavel('a pessoa já está na família ou já foi convidada')
  const i = await tx.integranteFamilia.create({
    data: {
      pessoaId,
      steamId64: e.steamId64 ?? null,
      origem: 'CONVITE',
      status: 'CONVITE_AUTORIZADO',
      ataConviteNumero: ataNumero,
    },
    select: { id: true },
  })
  await registrarEvento(tx, ctx, {
    acao: 'efeito.convite_integrante',
    entidade: 'integrante_familia',
    entidadeId: i.id,
    ataNumero,
  })
  return `aplicado: convite de ${e.apelido} autorizado; registre quando for feito na Steam`
}

/**
 * RN-CAD-09 (arts. 7º e 35): remoção autorizada. Se o removido é membro, o vínculo de membro
 * encerra já na aprovação (EXCLUSAO_ART35, com saiuEm). Lock 'fechamento' já tomado.
 */
export async function aplicarRemocao(
  tx: Tx,
  ctx: Contexto,
  e: EfeitoDe<'REMOCAO_INTEGRANTE'>,
  ataNumero: number,
  encerradaEm: Date,
): Promise<string> {
  const { count } = await tx.integranteFamilia.updateMany({
    where: { id: e.integranteId, pessoaId: e.pessoaId, status: 'ATIVO' },
    data: { status: 'REMOCAO_AUTORIZADA', ataRemocaoNumero: ataNumero },
  })
  if (count === 0) return naoAplicavel('o integrante não está ativo na família')
  const eraMembro = await encerrarMembro(
    tx,
    ctx,
    e.pessoaId,
    'EXCLUSAO_ART35',
    encerradaEm,
    ataNumero,
  )
  await registrarEvento(tx, ctx, {
    acao: 'efeito.remocao_integrante',
    entidade: 'integrante_familia',
    entidadeId: e.integranteId,
    ataNumero,
  })
  return `aplicado: remoção autorizada${eraMembro ? '; vínculo de membro encerrado' : ''}`
}
