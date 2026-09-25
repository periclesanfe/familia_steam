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
