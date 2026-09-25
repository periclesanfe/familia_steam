import 'server-only'

import { efeitoSchema } from '@/domain/efeitos'
import { apurarVotacao } from '@/domain/quorum'
import { parametrosSchema, versaoAplicavelSync } from '@/domain/regulamento'
import { deDb } from '@/domain/tempo'
import { db } from '@/server/db'

import { descreverEfeito } from './descricao'
import { EFEITOS_DISPONIVEIS } from './efeitos'

/** 07 §3.7: abertas (com "você ainda não votou") e encerradas (resultado e ATA). */
export async function listarVotacoes(pessoaId: string) {
  const votacoes = await db.votacao.findMany({
    orderBy: { abertaEm: 'desc' },
    select: {
      id: true,
      assunto: true,
      proposicao: true,
      status: true,
      abertaEm: true,
      encerraEm: true,
      encerradaEm: true,
      eleitoresIds: true,
      impedidosIds: true,
      ata: { select: { numero: true } },
      votos: { where: { pessoaId }, select: { opcao: true } },
    },
  })
  return votacoes.map((v) => ({
    ...v,
    euVotei: v.votos.length > 0,
    possoVotar: v.eleitoresIds.includes(pessoaId) && !v.impedidosIds.includes(pessoaId),
  }))
}

/** 07 §3.7 detalhe: placar ao vivo com nomes, pendentes, quórum e status derivado. */
export async function detalheVotacao(id: string, pessoaId: string, agora: Date) {
  const v = await db.votacao.findUnique({
    where: { id },
    include: {
      votos: { orderBy: { votadoEm: 'asc' } },
      ata: { select: { numero: true } },
      versaoRegulamento: { select: { numero: true } },
    },
  })
  if (!v) return null
  const [pessoas, membros] = await Promise.all([
    db.pessoa.findMany({
      where: { id: { in: [...v.eleitoresIds, v.convocadaPorId] } },
      select: { id: true, apelido: true },
    }),
    db.membro.findMany({
      where: { pessoaId: { in: v.eleitoresIds }, status: { in: ['ATIVO', 'IMPOSSIBILITADO'] } },
      select: { pessoaId: true },
    }),
  ])
  const nome = (pid: string) => pessoas.find((p) => p.id === pid)?.apelido ?? '—'
  const efeito = efeitoSchema.parse(v.efeito)
  const atuais = new Set(membros.map((m) => m.pessoaId))
  const derivado = v.status === 'ABERTA' ? apurarVotacao(v, v.votos, agora, atuais) : null
  const votaram = new Set(v.votos.map((x) => x.pessoaId))
  const favor = v.votos.filter((x) => x.opcao === 'FAVOR').length
  return {
    id: v.id,
    assunto: v.assunto,
    proposicao: v.proposicao,
    justificativa: v.justificativa,
    efeitoDescricao: await descreverEfeito(db, efeito),
    status: derivado && derivado.status !== 'ABERTA' ? derivado.status : v.status,
    aguardandoMaterializacao: derivado !== null && derivado.status !== 'ABERTA',
    motivo: v.motivoEncerramento,
    efeitoNaoAplicavel: v.efeitoNaoAplicavel,
    convocante: nome(v.convocadaPorId),
    podeCancelar:
      v.status === 'ABERTA' &&
      v.convocadaPorId === pessoaId &&
      v.assunto !== 'VETO_JOGO' &&
      v.votos.every((x) => x.pessoaId === v.convocadaPorId),
    abertaEm: v.abertaEm,
    encerraEm: v.encerraEm,
    encerradaEm: v.encerradaEm,
    n: v.n,
    quorum: v.quorum,
    versao: v.versaoRegulamento.numero,
    ata: v.ata?.numero ?? null,
    votos: v.votos.map((x) => ({
      nome: nome(x.pessoaId),
      opcao: x.opcao,
      eu: x.pessoaId === pessoaId,
    })),
    pendentes: v.eleitoresIds
      .filter((pid) => !votaram.has(pid) && !v.impedidosIds.includes(pid) && atuais.has(pid))
      .map(nome),
    impedidos: v.impedidosIds.map(nome),
    faltamFavor: Math.max(0, v.quorum - favor),
    possoVotar:
      v.status === 'ABERTA' &&
      agora < v.encerraEm &&
      v.eleitoresIds.includes(pessoaId) &&
      !v.impedidosIds.includes(pessoaId) &&
      !votaram.has(pessoaId),
  }
}

/** Opções do formulário "Nova votação" (07 §3.7), filtradas pelos efeitos já disponíveis. */
export async function opcoesDeConvocacao(agora: Date) {
  const [bloqueados, contestados, obrigacoes, pessoas, ciclos, rodadas, versoes] =
    await Promise.all([
      db.jogoBloqueado.findMany({
        where: { protegida: false, excluidoEm: null },
        select: { numero: true, nome: true },
        orderBy: { numero: 'asc' },
      }),
      db.pagamento.findMany({
        where: { status: { in: ['CONTESTADO', 'DECLARADO'] } },
        select: {
          id: true,
          valorCentavos: true,
          status: true,
          obrigacao: {
            select: {
              devedor: { select: { apelido: true } },
              credor: { select: { apelido: true } },
            },
          },
        },
      }),
      db.obrigacao.findMany({
        where: { canceladaEm: null, autoquitada: false },
        select: {
          id: true,
          tipo: true,
          valorCentavos: true,
          devedor: { select: { apelido: true } },
          credor: { select: { apelido: true } },
        },
        take: 200,
      }),
      db.pessoa.findMany({ where: { membros: { some: {} } }, select: { id: true, apelido: true } }),
      db.ciclo.findMany({ select: { id: true, numero: true }, orderBy: { numero: 'desc' } }),
      db.rodada.findMany({
        where: { status: { notIn: ['ANULADA', 'CANCELADA'] } },
        select: {
          id: true,
          sequencia: true,
          mesReferencia: true,
          ciclo: { select: { numero: true } },
        },
        orderBy: { agendadaPara: 'desc' },
      }),
      db.versaoRegulamento.findMany({
        select: {
          ordem: true,
          vigenteDesde: true,
          textoMarkdown: true,
          parametros: true,
          numero: true,
        },
      }),
    ])
  const vigente = versaoAplicavelSync(versoes, agora)
  return {
    efeitos: EFEITOS_DISPONIVEIS,
    bloqueados,
    pagamentos: contestados,
    obrigacoes,
    pessoas,
    ciclos,
    rodadas,
    regulamento: vigente
      ? {
          numero: vigente.numero,
          texto: vigente.textoMarkdown,
          parametros: parametrosSchema.parse(vigente.parametros),
        }
      : null,
  }
}

export const listarAtas = () =>
  db.ata.findMany({
    orderBy: { numero: 'desc' },
    select: {
      numero: true,
      data: true,
      votacao: { select: { id: true, assunto: true, status: true, proposicao: true } },
    },
  })

export async function ataPorNumero(numero: number) {
  const a = await db.ata.findUnique({
    where: { numero },
    select: {
      numero: true,
      data: true,
      markdown: true,
      sha256: true,
      votacaoId: true,
      geradaEm: true,
    },
  })
  return a && { ...a, data: deDb(a.data) }
}
