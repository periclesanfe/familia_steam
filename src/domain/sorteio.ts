// RN-SOR-05..08 (arts. 9º, 10, 12, 14, 29 e 30; D-05, D-08): elegibilidade e escolha, puras.
import type { MotivoSemContemplado, TipoContemplacao } from '@/generated/prisma/enums'

import {
  type ContribuicaoFato,
  emAtraso,
  pagosAte,
  vencidaEmAberto,
  vencimentoEfetivo,
} from './financeiro'
import type { Json } from './hash'

export const ALGORITMO_VERSAO = 'sorteio-v1'

export type ParticipanteSorteio = {
  pessoaId: string
  nome: string
  entrouEm: Date
  saiuEm: Date | null
  impossibilitado: boolean // status do membro no corte
}

export type EntradaSorteio = {
  cicloId: string
  participantes: readonly ParticipanteSorteio[]
  /** contempladoId de toda rodada do ciclo não ANULADA/CANCELADA (cessões já aplicadas). */
  contempladosIds: readonly string[]
  /** CONTRIBUICAO de todos os ciclos dos participantes. */
  contribuicoes: readonly ContribuicaoFato[]
  /** Quem tem NAO_CONCORRER válida para esta rodada no corte (RN-SOR-03/12). */
  naoConcorrem: readonly string[]
  /** Corte da 1ª rodada do ciclo (= T se esta é a 1ª), para a postergação (b). */
  primeiroCorte: Date
}

export type Motivo =
  | 'JA_CONTEMPLADO'
  | 'IMPOSSIBILITADO'
  | 'POSTERGADO_AGUARDANDO_DEMAIS'
  | 'NAO_EM_DIA'
  | 'OPTOU_NAO_CONCORRER'

export type LinhaSnapshot = {
  pessoaId: string
  nome: string
  contemplado: boolean
  impossibilitado: boolean
  postergado: boolean
  obrigacaoQuePostergou: string | null
  emDia: boolean
  vencidasEmAberto: string[]
  declarouNaoConcorrer: boolean
  camada: 'NORMAL' | 'POSTERGADO' | null
  elegivel: boolean
  motivos: Motivo[]
}

export type Resultado =
  | { tipo: 'CONTEMPLADA'; tipoContemplacao: TipoContemplacao; contempladoId: string }
  | { tipo: 'SEM_CONTEMPLADO'; motivo: MotivoSemContemplado }

export type Apuracao = {
  resultado: Resultado
  elegiveisIds: string[]
  indice: number | null
  snapshot: Json
}

/** RN-SOR-08: ordena por pessoaId e usa o índice do RNG (crypto.randomInt em produção). */
export function escolher(
  elegiveis: readonly string[],
  rng: (n: number) => number,
): { indice: number; escolhido: string } {
  const ordenados = [...elegiveis].sort()
  const indice = rng(ordenados.length)
  const escolhido = ordenados[indice]
  if (!Number.isInteger(indice) || escolhido === undefined)
    throw new RangeError('índice fora da faixa')
  return { indice, escolhido }
}

/** RN-SOR-07: postergado no ciclo C em T; devolve a obrigação que postergou (ou null). */
export function postergacao(
  pessoaId: string,
  e: Pick<EntradaSorteio, 'cicloId' | 'contribuicoes' | 'primeiroCorte'>,
  T: Date,
): string | null {
  const minhas = e.contribuicoes.filter((o) => o.devedorId === pessoaId)
  // (a) atraso em contribuição de rodada deste ciclo (pegajosa)
  const doCiclo = minhas.find((o) => o.cicloId === e.cicloId && emAtraso(o, T))
  if (doCiclo) return doCiclo.id
  // (b) no 1º corte do ciclo, dívida vencida de ciclo anterior (pagamentos com pixEm < corte)
  const corte = e.primeiroCorte
  const anterior = minhas.find(
    (o) =>
      o.cicloId !== e.cicloId &&
      !o.canceladaEm &&
      !o.autoquitada &&
      vencimentoEfetivo(o, o.diasProrrogacao) <= corte &&
      pagosAte(o.pagamentos, corte) < o.valorCentavos,
  )
  return anterior?.id ?? null
}

/** RN-SOR-05: função pura do corte. `rng` só é chamado quando há sorteio de fato. */
export function apurarSorteio(e: EntradaSorteio, T: Date, rng: (n: number) => number): Apuracao {
  const P = e.participantes.filter((p) => p.entrouEm <= T && (!p.saiuEm || p.saiuEm > T))
  const contemplados = new Set(e.contempladosIds)
  const NC = P.filter((p) => !contemplados.has(p.pessoaId))
  if (NC.length === 0) throw new Error('NC vazio: o ciclo já devia estar concluído (RN-CIC-04)')

  const declarou = new Set(e.naoConcorrem)
  const linhas = new Map<string, LinhaSnapshot>(
    P.map((p) => {
      const vencidas = e.contribuicoes
        .filter((o) => o.devedorId === p.pessoaId && vencidaEmAberto(o, T))
        .map((o) => o.id)
      const postergou = postergacao(p.pessoaId, e, T)
      return [
        p.pessoaId,
        {
          pessoaId: p.pessoaId,
          nome: p.nome,
          contemplado: contemplados.has(p.pessoaId),
          impossibilitado: p.impossibilitado,
          postergado: postergou !== null,
          obrigacaoQuePostergou: postergou,
          emDia: vencidas.length === 0,
          vencidasEmAberto: vencidas,
          declarouNaoConcorrer: declarou.has(p.pessoaId),
          camada: null,
          elegivel: false,
          motivos: contemplados.has(p.pessoaId) ? ['JA_CONTEMPLADO'] : [],
        },
      ]
    }),
  )
  const linha = (id: string): LinhaSnapshot => {
    const l = linhas.get(id)
    if (!l) throw new Error(`participante desconhecido: ${id}`)
    return l
  }

  let resultado: Resultado
  let elegiveis: string[] = []
  let indice: number | null = null

  if (NC.length === 1) {
    // art. 14: ignora arts. 12 e 13, atraso e postergação (D-05)
    const [u] = NC as [ParticipanteSorteio]
    if (u.impossibilitado) {
      linha(u.pessoaId).motivos.push('IMPOSSIBILITADO')
      resultado = { tipo: 'SEM_CONTEMPLADO', motivo: 'ULTIMO_IMPOSSIBILITADO' }
    } else {
      linha(u.pessoaId).elegivel = true
      elegiveis = [u.pessoaId]
      resultado = {
        tipo: 'CONTEMPLADA',
        tipoContemplacao: 'OBRIGATORIA_ART14',
        contempladoId: u.pessoaId,
      }
    }
  } else {
    const C0 = NC.filter((p) => !p.impossibilitado) // o impossibilitado não bloqueia postergados (D-08)
    for (const p of NC.filter((p) => p.impossibilitado))
      linha(p.pessoaId).motivos.push('IMPOSSIBILITADO')
    const normais = C0.filter((p) => !linha(p.pessoaId).postergado)
    const camada = normais.length > 0 ? normais : C0
    const nomeCamada = normais.length > 0 ? 'NORMAL' : 'POSTERGADO'
    for (const p of C0) {
      const l = linha(p.pessoaId)
      if (!camada.includes(p)) {
        l.motivos.push('POSTERGADO_AGUARDANDO_DEMAIS')
        continue
      }
      l.camada = nomeCamada
      if (!l.emDia) l.motivos.push('NAO_EM_DIA')
      if (l.declarouNaoConcorrer) l.motivos.push('OPTOU_NAO_CONCORRER')
      l.elegivel = l.emDia && !l.declarouNaoConcorrer
    }
    elegiveis = camada
      .filter((p) => linha(p.pessoaId).elegivel)
      .map((p) => p.pessoaId)
      .sort()
    if (elegiveis.length === 0) {
      resultado = { tipo: 'SEM_CONTEMPLADO', motivo: 'NENHUM_ELEGIVEL' }
    } else if (elegiveis.length === 1) {
      const [unico] = elegiveis as [string]
      resultado = { tipo: 'CONTEMPLADA', tipoContemplacao: 'UNICO_ELEGIVEL', contempladoId: unico }
    } else {
      const escolha = escolher(elegiveis, rng)
      indice = escolha.indice
      resultado = {
        tipo: 'CONTEMPLADA',
        tipoContemplacao: 'SORTEIO',
        contempladoId: escolha.escolhido,
      }
    }
  }

  const snapshot: Json = {
    algoritmoVersao: ALGORITMO_VERSAO,
    cicloId: e.cicloId,
    corteEm: T.toISOString(),
    ncIds: NC.map((p) => p.pessoaId).sort(),
    elegiveisIds: elegiveis,
    indice,
    resultado,
    participantes: [...linhas.values()]
      .sort((a, b) => a.pessoaId.localeCompare(b.pessoaId))
      .map((l) => ({ ...l })),
  }
  return { resultado, elegiveisIds: elegiveis, indice, snapshot }
}
