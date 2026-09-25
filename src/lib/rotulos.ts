// 12 UI-03/UI-17: um único dicionário enum → rótulo pt-BR + tom. Um teste garante cobertura.
import type {
  MotivoSemContemplado,
  StatusCiclo,
  StatusRodada,
  TipoContemplacao,
} from '@/generated/prisma/enums'

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
