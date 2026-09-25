// RN-VOT-01/08/09: assuntos, efeitos tipados (catálogo fechado) e chave de objeto.
import { z } from 'zod'

import type { AssuntoVotacao } from '@/generated/prisma/enums'

import { parametrosSchema } from './regulamento'

const id = z.uuid()
const steamId64 = z.string().regex(/^7656119\d{10}$/, 'SteamID64 inválido')

/** Efeitos de caso omisso e controvérsia (RN-VOT-09). */
export const efeitoCasoOmissoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('NENHUM') }),
  z.object({ tipo: z.literal('ANULAR_RODADA'), rodadaId: id }),
  z.object({ tipo: z.literal('RECONHECER_IMPOSSIBILIDADE'), pessoaId: id }),
  z.object({
    tipo: z.literal('RECONHECER_SAIDA'),
    pessoaId: id,
    saida: z.enum(['SAIDA_CONSORCIO', 'SAIDA_FAMILIA']),
    efetivaEm: z.coerce.date(),
  }),
  z.object({ tipo: z.literal('RETORNO_SORTEIOS'), pessoaId: id }),
  z.object({ tipo: z.literal('SUSPENDER_CONTRIBUICOES'), pessoaId: id, cicloId: id }),
  z.object({ tipo: z.literal('CANCELAR_OBRIGACAO'), obrigacaoId: id }),
  z.object({
    tipo: z.literal('CRIAR_DEVOLUCAO'),
    devedorId: id,
    credorId: id,
    valorCentavos: z.int().positive(),
    rodadaId: id,
  }),
  z.object({ tipo: z.literal('VALIDAR_PAGAMENTO'), pagamentoId: id }),
  z.object({ tipo: z.literal('INVALIDAR_PAGAMENTO'), pagamentoId: id }),
  z.object({ tipo: z.literal('REGULARIZAR_AQUISICAO'), aquisicaoId: id }),
  z.object({ tipo: z.literal('CONVERTER_PREMIO_EM_SOBRA'), rodadaId: id }),
  z.object({ tipo: z.literal('PERMITIR_MULTIPLAS_AQUISICOES'), rodadaId: id }),
  z.object({ tipo: z.literal('DESBLOQUEAR_CONTEUDO_ADULTO'), appId: z.int().positive() }),
  z.object({
    tipo: z.literal('REVINCULAR_STEAM'),
    pessoaId: id,
    novoSteamId64: steamId64,
    incluirNaFamilia: z.boolean(),
  }),
  z.object({ tipo: z.literal('ADIAR_CICLO'), cicloId: id, novaDataInicio: z.iso.date() }),
])
export type EfeitoCasoOmisso = z.infer<typeof efeitoCasoOmissoSchema>

/** Efeito gravado em Votacao.efeito: o próprio assunto (quando fixo) ou o de caso omisso. */
export const efeitoSchema = z.discriminatedUnion('tipo', [
  ...efeitoCasoOmissoSchema.options,
  z.object({ tipo: z.literal('VETO_JOGO'), avisoId: id }),
  z.object({ tipo: z.literal('JOGO_DE_OUTRO_MEMBRO'), avisoId: id }),
  z.object({ tipo: z.literal('EXCLUSAO_BLOQUEIO'), numero: z.int().positive() }),
  z.object({ tipo: z.literal('CESSAO_VEZ'), cessaoId: id }),
  z.object({
    tipo: z.literal('ADMISSAO_MEMBRO'),
    nome: z.string().trim().min(3),
    steamId64,
    incluirNaFamilia: z.boolean(),
  }),
  z.object({
    tipo: z.literal('CONVITE_INTEGRANTE'),
    apelido: z.string().trim().min(1),
    steamId64: steamId64.optional(),
    pessoaId: id.optional(),
  }),
  z.object({ tipo: z.literal('REMOCAO_INTEGRANTE'), integranteId: id, pessoaId: id }),
  z.object({
    tipo: z.literal('PERMANENCIA_ART30'),
    pessoaId: id,
    escopo: z.enum(['CONSORCIO', 'CONSORCIO_E_FAMILIA']),
  }),
  z.object({
    tipo: z.literal('CONTINUIDADE_CONSORCIO'),
    acao: z.enum(['ENCERRAR_AO_FIM_DO_CICLO', 'ENCERRAR_IMEDIATAMENTE']),
  }),
  z.object({
    tipo: z.literal('ALTERACAO_REGULAMENTO'),
    texto: z.string().min(100),
    resumo: z.string().trim().min(10),
    parametros: parametrosSchema,
    excluirEntradas: z.array(z.int().positive()).default([]),
  }),
])
export type Efeito = z.infer<typeof efeitoSchema>
export type TipoEfeito = Efeito['tipo']

/** Assuntos cujo efeito é o próprio assunto (RN-VOT-08). */
const FIXOS = [
  'VETO_JOGO',
  'JOGO_DE_OUTRO_MEMBRO',
  'EXCLUSAO_BLOQUEIO',
  'CESSAO_VEZ',
  'ADMISSAO_MEMBRO',
  'CONVITE_INTEGRANTE',
  'REMOCAO_INTEGRANTE',
  'PERMANENCIA_ART30',
  'CONTINUIDADE_CONSORCIO',
  'ALTERACAO_REGULAMENTO',
] as const satisfies readonly AssuntoVotacao[]

/** O efeito combina com o assunto? (CASO_OMISSO/CONTROVERSIA: catálogo RN-VOT-09; OUTRO: NENHUM.) */
export function efeitoCombina(assunto: AssuntoVotacao, efeito: Efeito): boolean {
  if ((FIXOS as readonly string[]).includes(assunto)) return efeito.tipo === assunto
  if (assunto === 'OUTRO') return efeito.tipo === 'NENHUM'
  return efeitoCasoOmissoSchema.safeParse(efeito).success
}

/** RN-VOT-01: objeto da votação; duas abertas com o mesmo (assunto, chave) são recusadas. */
/** O assunto já faz parte do índice único (assunto, chaveObjeto): a chave vem só do efeito. */
export function chaveObjeto(efeito: Efeito, votacaoId: string): string {
  switch (efeito.tipo) {
    case 'VETO_JOGO':
    case 'JOGO_DE_OUTRO_MEMBRO':
      return `aviso:${efeito.avisoId}`
    case 'CESSAO_VEZ':
      return `cessao:${efeito.cessaoId}`
    case 'ADMISSAO_MEMBRO':
      return `steam:${efeito.steamId64}`
    case 'CONVITE_INTEGRANTE':
      return efeito.pessoaId
        ? `pessoa:${efeito.pessoaId}`
        : `steam:${efeito.steamId64 ?? efeito.apelido}`
    case 'REMOCAO_INTEGRANTE':
    case 'PERMANENCIA_ART30':
      return `pessoa:${efeito.pessoaId}`
    case 'EXCLUSAO_BLOQUEIO':
      return `bloqueio:${String(efeito.numero)}`
    case 'CONTINUIDADE_CONSORCIO':
      return 'consorcio'
    case 'ALTERACAO_REGULAMENTO':
      return 'regulamento'
    case 'NENHUM':
      return `votacao:${votacaoId}`
    default: {
      // CASO_OMISSO/CONTROVERSIA: <EFEITO>:<primeiro parâmetro>
      const [, primeiro] = Object.entries(efeito).find(([k]) => k !== 'tipo') ?? []
      return `${efeito.tipo}:${String(primeiro)}`
    }
  }
}
