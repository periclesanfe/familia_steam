// RN-VOT-06 (art. 2º, VIII; Anexo II; D-14): a ATA é um markdown imutável com hash (C-HASH).
import type { AssuntoVotacao, MotivoEncerramentoVotacao, OpcaoVoto } from '@/generated/prisma/enums'

import type { Efeito } from './efeitos'

export type DadosAta = {
  numero: number
  data: string // DataCivil do encerramento (SP)
  convocante: string
  assunto: AssuntoVotacao
  efeito: Efeito
  descricaoEfeito: string
  proposicao: string
  justificativa: string
  votos: { nome: string; opcao: OpcaoVoto }[]
  naoVotaram: string[]
  impedidos: string[]
  aprovada: boolean
  motivo: MotivoEncerramentoVotacao
  abertaEm: string // "dd/mm/aaaa às hh:mm" (SP), já formatado
  encerradaEm: string
  n: number
  quorum: number
  versao: string
  resultadoDoEfeito: string // "aplicado: …" ou "não aplicável: …" ou "sem efeito no sistema"
}

const ROTULOS: Record<AssuntoVotacao, [marca: string, artigo: string]> = {
  VETO_JOGO: ['Veto de jogo', 'art. 23'],
  CESSAO_VEZ: ['Cessão da vez', 'art. 13'],
  CONVITE_INTEGRANTE: ['Inclusão ou remoção de integrante da FAMÍLIA STEAM', 'arts. 7º e 35'],
  REMOCAO_INTEGRANTE: ['Inclusão ou remoção de integrante da FAMÍLIA STEAM', 'arts. 7º e 35'],
  PERMANENCIA_ART30: ['Permanência de MEMBRO impossibilitado de pagar', 'art. 30'],
  ALTERACAO_REGULAMENTO: ['Alteração do Regulamento', 'art. 42'],
  CASO_OMISSO: ['Caso omisso', 'art. 43'],
  JOGO_DE_OUTRO_MEMBRO: ['Outro', 'art. 16, IV'],
  EXCLUSAO_BLOQUEIO: ['Outro', 'art. 23, §6º'],
  ADMISSAO_MEMBRO: ['Outro', 'art. 6º'],
  CONTINUIDADE_CONSORCIO: ['Outro', 'art. 38, p.u.'],
  CONTROVERSIA: ['Outro', 'art. 47'],
  OUTRO: ['Outro', 'art. 41'],
}

const NOME_ASSUNTO: Record<AssuntoVotacao, string> = {
  VETO_JOGO: 'Veto de jogo',
  JOGO_DE_OUTRO_MEMBRO: 'Jogo que outro membro já tem',
  EXCLUSAO_BLOQUEIO: 'Exclusão de entrada do Anexo I',
  CESSAO_VEZ: 'Cessão da vez',
  ADMISSAO_MEMBRO: 'Admissão de membro',
  CONVITE_INTEGRANTE: 'Convite de integrante',
  REMOCAO_INTEGRANTE: 'Remoção de integrante',
  PERMANENCIA_ART30: 'Permanência (art. 30)',
  CONTINUIDADE_CONSORCIO: 'Continuidade do consórcio',
  ALTERACAO_REGULAMENTO: 'Alteração do Regulamento',
  CASO_OMISSO: 'Caso omisso',
  CONTROVERSIA: 'Controvérsia',
  OUTRO: 'Outro',
}
export const nomeDoAssunto = (a: AssuntoVotacao): string => NOME_ASSUNTO[a]

const INCLUSAO = 'Inclusão ou remoção de integrante da FAMÍLIA STEAM (arts. 7º e 35)'
const MARCAS = [
  'Veto de jogo (art. 23)',
  'Cessão da vez (art. 13)',
  INCLUSAO,
  'Permanência de MEMBRO impossibilitado de pagar (art. 30)',
  'Alteração do Regulamento (art. 42)',
  'Caso omisso (art. 43)',
]

const MOTIVO: Record<MotivoEncerramentoVotacao, string> = {
  QUORUM_ATINGIDO: 'quórum de aprovação atingido',
  APROVACAO_IMPOSSIVEL: 'aprovação matematicamente impossível',
  PRAZO: 'prazo de votação encerrado',
  CANCELADA_PELO_CONVOCANTE: 'cancelada pelo convocante',
  PREJUDICADA: 'prejudicada (objeto deixou de existir)',
}

/**
 * Texto livre (proposição, justificativa, nomes) entra na ATA como texto puro: uma linha só e
 * sintaxe markdown escapada, para ninguém forjar uma linha de "Resultado" no documento imutável.
 */
export const textoPlano = (s: string): string =>
  s
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[\\`*_[\]#|<>()!~]/g, (c) => `\\${c}`)
    .trim()

/** Anexo II + extras. Assunto sem checkbox próprio sai como "Outro: <assunto> (art. X)". */
export function gerarAta(a: DadosAta): string {
  const [marca, artigo] = ROTULOS[a.assunto]
  const inclusao =
    (a.efeito.tipo === 'ADMISSAO_MEMBRO' || a.efeito.tipo === 'REVINCULAR_STEAM') &&
    a.efeito.incluirNaFamilia
  const marcadas = new Set<string>()
  if (marca !== 'Outro') marcadas.add(`${marca} (${artigo})`)
  if (inclusao) marcadas.add(INCLUSAO)
  const por = (o: OpcaoVoto) => a.votos.filter((v) => v.opcao === o).map((v) => v.nome)
  const [favor, contra, abst] = [por('FAVOR'), por('CONTRA'), por('ABSTENCAO')]
  const lista = (nomes: string[]) => (nomes.length ? nomes.map(textoPlano).join(', ') : '—')
  const [dia, mes, ano] = [a.data.slice(8, 10), a.data.slice(5, 7), a.data.slice(0, 4)]

  return [
    `# ATA Nº ${String(a.numero)}, de ${dia}/${mes}/${ano}`,
    '',
    `**Convocada por:** ${textoPlano(a.convocante)}`,
    '',
    '**Assunto (marcar):**',
    '',
    ...MARCAS.map((m) => `- (${marcadas.has(m) ? 'x' : ' '}) ${m}`),
    `- (${marca === 'Outro' ? 'x' : ' '}) Outro${marca === 'Outro' ? `: ${NOME_ASSUNTO[a.assunto]} (${artigo})` : ''}`,
    '',
    `**Descrição:** ${textoPlano(a.proposicao)}`,
    '',
    `**Justificativa:** ${textoPlano(a.justificativa)}`,
    '',
    `**Efeito proposto:** ${textoPlano(a.descricaoEfeito)}`,
    '',
    `| Voto | Quantidade | Nomes |`,
    `| --- | --- | --- |`,
    `| A favor | ${String(favor.length)} | ${lista(favor)} |`,
    `| Contra | ${String(contra.length)} | ${lista(contra)} |`,
    `| Abstenções | ${String(abst.length)} | ${lista(abst)} |`,
    '',
    `**Resultado:** (${a.aprovada ? 'x' : ' '}) Aprovado   (${a.aprovada ? ' ' : 'x'}) Rejeitado`,
    '',
    '## Registro do sistema',
    '',
    `- Aberta em ${a.abertaEm}; encerrada em ${a.encerradaEm} (${MOTIVO[a.motivo]}).`,
    `- Eleitores: ${String(a.n)}; quórum: ${String(a.quorum)} votos a favor (art. 2º, IX).`,
    `- Não votaram: ${lista(a.naoVotaram)}.`,
    `- Impedidos de votar: ${lista(a.impedidos)}.`,
    `- Regulamento vigente na convocação: versão ${a.versao}.`,
    `- Efeito: ${a.resultadoDoEfeito}.`,
    '',
  ].join('\n')
}
