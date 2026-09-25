// Log estruturado em JSON (08 §8.3, 14 SEG-11). Nunca passe PII, token, corpo de requisição
// ou URL com segredo em `dados`.
type Dados = Record<string, string | number | boolean | null | undefined>

const escrever = (nivel: 'info' | 'aviso' | 'erro', evento: string, dados: Dados = {}) => {
  const linha = JSON.stringify({ em: new Date().toISOString(), nivel, evento, ...dados })
  if (nivel === 'erro') console.error(linha)
  else console.log(linha)
}

export const log = {
  info: (evento: string, dados?: Dados) => {
    escrever('info', evento, dados)
  },
  aviso: (evento: string, dados?: Dados) => {
    escrever('aviso', evento, dados)
  },
  erro: (evento: string, dados?: Dados) => {
    escrever('erro', evento, dados)
  },
}
