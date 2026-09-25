// 12 UI-03/UI-17: um único dicionário enum → rótulo pt-BR + tom. Um teste garante cobertura.
import type { Situacao } from '@/domain/financeiro'
import type {
  MotivoContestacao,
  MotivoSemContemplado,
  StatusPagamento,
  StatusCessao,
  StatusCiclo,
  StatusRodada,
  StatusVotacao,
  TipoContemplacao,
} from '@/generated/prisma/enums'

export const STATUS_VOTACAO: Record<StatusVotacao, { rotulo: string; tom: Tom }> = {
  ABERTA: { rotulo: 'Aberta', tom: 'neutro' },
  APROVADA: { rotulo: 'Aprovada', tom: 'sucesso' },
  REJEITADA: { rotulo: 'Rejeitada', tom: 'perigo' },
  CANCELADA: { rotulo: 'Cancelada', tom: 'inativo' },
}

export type Tom = 'neutro' | 'sucesso' | 'atencao' | 'perigo' | 'inativo'
type Rotulo = { rotulo: string; tom: Tom }

export const STATUS_RODADA: Record<StatusRodada, Rotulo> = {
  AGENDADA: { rotulo: 'Agendada', tom: 'neutro' },
  CONTEMPLADA: { rotulo: 'Contemplada', tom: 'sucesso' },
  SEM_CONTEMPLADO: { rotulo: 'Sem contemplado', tom: 'atencao' },
  FECHADA: { rotulo: 'Fechada', tom: 'inativo' },
  ANULADA: { rotulo: 'Anulada', tom: 'perigo' },
  CANCELADA: { rotulo: 'Cancelada', tom: 'inativo' },
}

export const STATUS_CESSAO: Record<StatusCessao, Rotulo> = {
  AGUARDANDO_ACEITE: { rotulo: 'Aguardando aceite', tom: 'atencao' },
  EM_VOTACAO: { rotulo: 'Em votação', tom: 'neutro' },
  APROVADA: { rotulo: 'Aprovada', tom: 'sucesso' },
  REJEITADA: { rotulo: 'Rejeitada', tom: 'perigo' },
  CANCELADA: { rotulo: 'Cancelada', tom: 'inativo' },
}

export const STATUS_CICLO: Record<StatusCiclo, Rotulo> = {
  PLANEJADO: { rotulo: 'Planejado', tom: 'neutro' },
  EM_ANDAMENTO: { rotulo: 'Em andamento', tom: 'sucesso' },
  EM_REVISAO: { rotulo: 'Em revisão', tom: 'atencao' },
  ENCERRADO: { rotulo: 'Encerrado', tom: 'inativo' },
  CANCELADO: { rotulo: 'Cancelado', tom: 'inativo' },
}

export const TIPO_CONTEMPLACAO: Record<TipoContemplacao, string> = {
  SORTEIO: 'Sorteio',
  UNICO_ELEGIVEL: 'Único elegível',
  OBRIGATORIA_ART14: 'Obrigatória (art. 14)',
}

export const MOTIVO_SEM_CONTEMPLADO: Record<MotivoSemContemplado, string> = {
  NENHUM_ELEGIVEL: 'Nenhum elegível',
  ULTIMO_IMPOSSIBILITADO: 'Último não contemplado impossibilitado (art. 30)',
}

/** Motivos do snapshot (RN-SOR-05). */
export const MOTIVO_SORTEIO: Record<string, string> = {
  JA_CONTEMPLADO: 'Já contemplado',
  IMPOSSIBILITADO: 'Impossibilitado (art. 30)',
  POSTERGADO_AGUARDANDO_DEMAIS: 'Postergado (art. 29)',
  NAO_EM_DIA: 'Não está em dia (art. 10, II)',
  OPTOU_NAO_CONCORRER: 'Optou por não concorrer (art. 12)',
}

export const SITUACAO: Record<Situacao, Rotulo> = {
  NO_PRAZO: { rotulo: 'No prazo', tom: 'neutro' },
  PRORROGADA: { rotulo: 'Prorrogada', tom: 'atencao' },
  EM_ATRASO: { rotulo: 'Em atraso', tom: 'perigo' },
  QUITADA: { rotulo: 'Quitada', tom: 'sucesso' },
  QUITADA_EM_ATRASO: { rotulo: 'Quitada em atraso', tom: 'atencao' },
  AUTOQUITADA: { rotulo: 'Contemplado', tom: 'sucesso' },
  CANCELADA: { rotulo: 'Cancelada', tom: 'inativo' },
}

export const STATUS_PAGAMENTO: Record<StatusPagamento, Rotulo> = {
  DECLARADO: { rotulo: 'Declarado', tom: 'neutro' },
  CONFIRMADO: { rotulo: 'Confirmado', tom: 'sucesso' },
  CONTESTADO: { rotulo: 'Contestado', tom: 'atencao' },
  INVALIDADO: { rotulo: 'Invalidado', tom: 'inativo' },
}

export const MOTIVO_CONTESTACAO: Record<MotivoContestacao, string> = {
  NAO_RECEBIDO: 'Não recebi',
  VALOR_DIVERGENTE: 'Valor diferente',
  DATA_DIVERGENTE: 'Data diferente',
}

export const TIPO_OBRIGACAO: Record<string, string> = {
  CONTRIBUICAO: 'Contribuição',
  SOBRA: 'SOBRA',
  REPASSE_CESSAO: 'Repasse (cessão)',
  RATEIO_SOBRA: 'Rateio da SOBRA',
  DEVOLUCAO: 'Devolução',
}

export const STATUS_AVISO: Record<string, Rotulo> = {
  JANELA_VETO: { rotulo: 'Janela de veto', tom: 'neutro' },
  EM_VOTACAO_VETO: { rotulo: 'Em votação de veto', tom: 'atencao' },
  AGUARDANDO_16IV: { rotulo: 'Aguardando autorização (art. 16, IV)', tom: 'atencao' },
  AUTORIZADO: { rotulo: 'Compra autorizada', tom: 'sucesso' },
  UTILIZADO: { rotulo: 'Comprado', tom: 'sucesso' },
  VETADO: { rotulo: 'Vetado', tom: 'perigo' },
  NAO_AUTORIZADO_16IV: { rotulo: 'Não autorizado (art. 16, IV)', tom: 'perigo' },
  SUBSTITUIDO: { rotulo: 'Substituído', tom: 'inativo' },
  EXPIRADO: { rotulo: 'Expirado', tom: 'inativo' },
}

export const IRREGULARIDADE: Record<string, string> = {
  SEM_AVISO: 'sem aviso prévio',
  ANTES_DA_AUTORIZACAO: 'antes da autorização',
  DURANTE_VOTACAO_VETO: 'durante votação de veto',
  DURANTE_VOTACAO_CESSAO: 'durante votação de cessão',
  APOS_PRAZO: 'depois do prazo',
  JOGO_BLOQUEADO: 'jogo do Anexo I',
  PRODUTO_DIFERENTE_DO_AVISO: 'produto diferente do aviso',
  SEGUNDA_AQUISICAO: 'segunda aquisição',
  SEM_AUTORIZACAO_16IV: 'sem autorização (art. 16, IV)',
  CONTA_DIFERENTE_DO_CONTEMPLADO: 'conta Steam de outra pessoa',
}

export const VERIFICACAO: Record<string, string> = {
  PENDENTE: 'verificação na biblioteca pendente',
  VERIFICADO: 'encontrado na biblioteca',
  NAO_ENCONTRADO: 'não encontrado na biblioteca',
  NAO_VERIFICAVEL: 'não verificável (envie print)',
}
