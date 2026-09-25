import type { ContextoAcao } from '@/server/acao'

/** RN-GER-05: ato do GRUPO registrado por outro membro, com print e o horário da mensagem. */
export type Transcricao = { pessoaId: string; efetivaEm: Date; evidenciaAnexoId: string }

/** Autoria da declaração: o próprio ator agora, ou o sujeito transcrito com seu horário. */
export const autoria = (ctx: ContextoAcao, t?: Transcricao) => ({
  pessoaId: t?.pessoaId ?? ctx.ator.pessoaId,
  efetivaEm: t?.efetivaEm ?? ctx.agora,
  registradaEm: ctx.agora,
  registradaPorId: ctx.ator.pessoaId,
  evidenciaAnexoId: t?.evidenciaAnexoId ?? null,
})
