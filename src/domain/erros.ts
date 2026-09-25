// Catálogo de erros de negócio: código estável, mensagem pt-BR segura para a UI e artigo (14 SEG-11).

export const ERROS = {
  NAO_AUTENTICADO: { mensagem: 'Entre com sua conta Steam para continuar.' },
  SEM_PERMISSAO: { mensagem: 'Você não tem permissão para esta ação.' },
  NAO_ENCONTRADO: { mensagem: 'Registro não encontrado.' },
  ENTRADA_INVALIDA: { mensagem: 'Confira os campos destacados.' },
  OCUPADO: { mensagem: 'O sistema está ocupado. Tente de novo em instantes.' },
  REGULAMENTO_NAO_VIGENTE: {
    mensagem: 'O Regulamento ainda não está em vigor.',
    artigo: 'art. 46',
  },
  VOTACAO_ENCERRADA: { mensagem: 'Esta votação já foi encerrada.', artigo: 'art. 41' },
  VOTO_JA_REGISTRADO: {
    mensagem: 'Seu voto já foi registrado e é irretratável.',
    artigo: 'art. 41',
  },
  ELEITOR_INVALIDO: { mensagem: 'Você não é eleitor desta votação.', artigo: 'art. 2º, IX' },
  SORTEIO_ANTES_DO_HORARIO: {
    mensagem: 'O sorteio só pode ser realizado a partir do horário agendado.',
    artigo: 'art. 8º',
  },
  SORTEIO_FORA_DE_ORDEM: { mensagem: 'Há uma rodada anterior deste ciclo ainda por sortear.' },
  RODADA_ENCERRADA: {
    mensagem: 'O sorteio desta rodada já foi realizado.',
    artigo: 'art. 12',
  },
  NAO_PARTICIPA: { mensagem: 'Você não participa desta rodada.', artigo: 'art. 12' },
  VALOR_ACIMA_DO_SALDO: {
    mensagem: 'O valor passa do saldo em aberto desta obrigação.',
    artigo: 'art. 11',
  },
  PAGAMENTO_EM_ESTADO_INVALIDO: {
    mensagem: 'Este pagamento não está num estado que permita a ação.',
  },
  JUSTIFICATIVA_FORA_DO_PRAZO: {
    mensagem: 'A justificativa só vale se registrada antes do vencimento.',
    artigo: 'art. 11, p.u.',
  },
} as const satisfies Record<string, { mensagem: string; artigo?: string }>

export type CodigoErro = keyof typeof ERROS

export class ErroDeNegocio extends Error {
  readonly codigo: CodigoErro
  readonly artigo: string | undefined

  constructor(codigo: CodigoErro, mensagem?: string, artigo?: string) {
    const padrao: { mensagem: string; artigo?: string } = ERROS[codigo]
    super(mensagem ?? padrao.mensagem)
    this.name = 'ErroDeNegocio'
    this.codigo = codigo
    this.artigo = artigo ?? padrao.artigo
  }
}

/** Guarda de regra: lança `ErroDeNegocio` se a condição for falsa. */
export function exigir(
  condicao: unknown,
  codigo: CodigoErro,
  mensagem?: string,
  artigo?: string,
): asserts condicao {
  if (!condicao) throw new ErroDeNegocio(codigo, mensagem, artigo)
}
