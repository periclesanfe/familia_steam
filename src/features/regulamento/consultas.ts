import 'server-only'

import { diffLinhas, trechosDoDiff } from '@/domain/diff'
import { adesaoValida, parametrosSchema, versaoVigente } from '@/domain/regulamento'
import { deDb } from '@/domain/tempo'
import { db } from '@/server/db'

/** Versão vigente, ou a 1.0 aguardando assinaturas (RN-REG-02/04). */
export async function versaoAplicavel(agora: Date) {
  const versoes = await db.versaoRegulamento.findMany({
    select: { id: true, ordem: true, numero: true, sha256: true, vigenteDesde: true },
    orderBy: { ordem: 'asc' },
  })
  const alvo = versaoVigente(versoes, agora) ?? versoes.find((v) => v.ordem === 0) ?? null
  if (!alvo) return null
  const { textoMarkdown } = await db.versaoRegulamento.findUniqueOrThrow({
    where: { id: alvo.id },
    select: { textoMarkdown: true },
  })
  return { ...alvo, textoMarkdown, versoes }
}

/** Anexo I (RN-BLO): entradas vigentes e excluídas. */
export const anexoI = async () =>
  (
    await db.jogoBloqueado.findMany({
      orderBy: { numero: 'asc' },
      select: {
        numero: true,
        nome: true,
        dataVeto: true,
        origemTexto: true,
        motivo: true,
        ataInclusaoNumero: true,
        excluidoEm: true,
        ataExclusaoNumero: true,
      },
    })
  ).map((j) => ({ ...j, dataVeto: j.dataVeto ? deDb(j.dataVeto) : null }))

/** Quantos fundadores já têm adesão válida à versão (tela de espera do onboarding). */
export async function progressoDasAssinaturas(versao: { id: string; sha256: string }) {
  const fundadores = await db.membro.findMany({
    where: { origem: 'FUNDADOR', status: { not: 'ENCERRADO' } },
    select: {
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
  const assinaram = fundadores.filter((f) =>
    f.pessoa.adesoes.some((a) => adesaoValida(a, versao, { steamId64: f.pessoa.steamId64 ?? '' })),
  ).length
  return { assinaram, total: fundadores.length }
}

/** RN-REG-04: a alteração do Regulamento em votação (uma por vez por família), se houver. */
export const alteracaoEmVotacao = () =>
  db.votacao.findFirst({
    where: { assunto: 'ALTERACAO_REGULAMENTO', status: 'ABERTA' },
    select: { id: true, encerraEm: true, proposicao: true },
  })

/**
 * RN-REG-08 / RN-REG-03: base do editor — o rascunho (antes da vigência) ou a versão vigente,
 * com o modo de edição e a votação de alteração aberta, se houver.
 */
export async function estadoDoEditor(agora: Date) {
  const [versoes, aberta] = await Promise.all([
    db.versaoRegulamento.findMany({
      select: {
        id: true,
        ordem: true,
        numero: true,
        vigenteDesde: true,
        textoMarkdown: true,
        parametros: true,
        sha256: true,
      },
      orderBy: { ordem: 'asc' },
    }),
    alteracaoEmVotacao(),
  ])
  const vigente = versaoVigente(versoes, agora)
  const base = vigente ?? versoes.find((v) => v.ordem === 0) ?? null
  if (!base) return null
  return {
    modo: vigente ? ('proposta' as const) : ('rascunho' as const),
    id: base.id,
    sha256: base.sha256,
    numero: base.numero,
    texto: base.textoMarkdown,
    parametros: parametrosSchema.parse(base.parametros),
    votacaoAberta: aberta,
  }
}

/** RN-REG-08: histórico das edições do rascunho (auditoria da família), mais recente primeiro. */
export async function revisoesDoRascunho() {
  const eventos = await db.eventoAuditoria.findMany({
    where: { acao: 'regulamento.rascunho' },
    orderBy: { id: 'desc' },
    take: 30,
    select: { id: true, ocorridoEm: true, atorPessoaId: true, dados: true },
  })
  const autores = await db.pessoa.findMany({
    where: { id: { in: eventos.flatMap((e) => (e.atorPessoaId ? [e.atorPessoaId] : [])) } },
    select: { id: true, apelido: true, steamNick: true },
  })
  return eventos.map((e) => {
    const d = e.dados as {
      antes?: { texto?: string }
      depois?: { texto?: string; resumo?: string; assinaturasInvalidadas?: number }
    }
    const autor = autores.find((a) => a.id === e.atorPessoaId)
    return {
      id: e.id,
      em: e.ocorridoEm,
      autor: autor ? (autor.steamNick ?? autor.apelido) : '—',
      resumo: d.depois?.resumo ?? '',
      assinaturasInvalidadas: d.depois?.assinaturasInvalidadas ?? 0,
      trechos: trechosDoDiff(diffLinhas(d.antes?.texto ?? '', d.depois?.texto ?? '')),
    }
  })
}

/** RN-REG-03/04: versões da família, com vigência, resumo e a ATA que aprovou. */
export const historicoDeVersoes = () =>
  db.versaoRegulamento.findMany({
    orderBy: { ordem: 'desc' },
    select: {
      numero: true,
      vigenteDesde: true,
      aprovadaEm: true,
      resumoAlteracoes: true,
      ataNumero: true,
    },
  })
