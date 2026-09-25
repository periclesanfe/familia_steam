// RN-COM-04/05/09 (arts. 16 a 26; D-10, D-11, D-15, D-24, D-31): validações do produto, status
// derivado do aviso e irregularidades da compra. Funções puras sobre fatos.
import type { IrregularidadeAquisicao, TipoProduto } from '@/generated/prisma/enums'

export type Regra =
  'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8' | 'V9' | 'V10' | 'V11' | 'V12'
export type Resultado = 'OK' | 'ALERTA' | 'BLOQUEIO' | 'DESCONHECIDO'
export type Exigencia = 'NENHUMA' | 'DECLARACAO' | 'DECLARACAO_E_EVIDENCIA'

export type Validacao = {
  regra: Regra
  resultado: Resultado
  mensagem: string
  artigo: string
  exige: Exigencia
}

/** Dados da loja de um app (SteamApp com sucesso); null = desconhecido (falha, pausa, sem cache). */
export type AppLoja = {
  tipo: string
  gratuito: boolean
  nome: string
  categorias: readonly number[]
  descritores: readonly number[]
  jogoBaseAppId: number | null
  emBreve: boolean
} | null

export type EntradaValidacao = {
  produto: { tipo: TipoProduto; appId: number; appIdsIncluidos: readonly number[]; nome: string }
  /** loja: por appId (principal, incluídos e jogo base) */
  loja: ReadonlyMap<number, AppLoja>
  /** appIds de entradas JOGO vigentes do Anexo I */
  bloqueados: ReadonlySet<number>
  /** appIds com DESBLOQUEAR_CONTEUDO_ADULTO aprovado */
  desbloqueadosAdulto: ReadonlySet<number>
  /** biblioteca do contemplado; null = privada ou não sincronizada */
  bibliotecaContemplado: ReadonlySet<number> | null
  /** outros membros (ATIVO/IMPOSSIBILITADO, exceto o contemplado); biblioteca null = privada */
  outros: readonly { apelido: string; biblioteca: ReadonlySet<number> | null }[]
  janelaVetoAte: Date
  prazoCompraAte: Date
  agora: Date
}

const MOEDA =
  /\b(coins?|moedas?|gems?|gemas?|gold|ouro|credits?|créditos?|points?|pontos|currency|skins?|items?|itens|v-?bucks|tokens?)\b/i
const QUATRO_DIAS_MS = 96 * 3_600_000

/** Todos os apps do produto: principal + incluídos (em PACOTE). */
export const appsDoProduto = (p: EntradaValidacao['produto']): number[] => [
  ...new Set([p.appId, ...p.appIdsIncluidos]),
]

const v = (
  regra: Regra,
  resultado: Resultado,
  mensagem: string,
  artigo: string,
  exige: Exigencia = 'NENHUMA',
): Validacao => ({
  regra,
  resultado,
  mensagem,
  artigo,
  exige,
})

/** RN-COM-04: V1–V12. Falha ou pausa da Steam nunca bloqueia sozinha: vira DESCONHECIDO. */
export function validarProduto(e: EntradaValidacao): Validacao[] {
  const apps = appsDoProduto(e.produto)
  const loja = (id: number) => e.loja.get(id) ?? null
  const principal = loja(e.produto.appId)
  const desconhecidos = apps.filter((id) => loja(id) === null)
  const ehDlc = e.produto.tipo === 'DLC' || principal?.tipo === 'dlc'
  const r: Validacao[] = []

  // V1 — Anexo I (art. 16, III)
  const bloqueado = apps.find((id) => e.bloqueados.has(id))
  r.push(
    bloqueado !== undefined
      ? v(
          'V1',
          'BLOQUEIO',
          `O app ${String(bloqueado)} está na Lista de Jogos Bloqueados.`,
          'art. 16, III',
        )
      : v('V1', 'OK', 'Fora do Anexo I.', 'art. 16, III'),
  )

  // V2 — DLC cujo jogo base está bloqueado
  const base = principal?.jogoBaseAppId ?? null
  if (ehDlc && base !== null && e.bloqueados.has(base)) {
    r.push(v('V2', 'ALERTA', 'O jogo base desta DLC está no Anexo I.', 'art. 23', 'DECLARACAO'))
  }

  // V3/V4 — conteúdo adulto (art. 17)
  const adulto = apps.find(
    (id) => loja(id)?.descritores.includes(3) && !e.desbloqueadosAdulto.has(id),
  )
  const nudez = apps.find((id) => loja(id)?.descritores.some((d) => d === 1 || d === 4))
  if (adulto !== undefined) {
    r.push(
      v('V3', 'BLOQUEIO', 'Conteúdo sexual só para adultos (descritor 3 da Steam).', 'art. 17'),
    )
  } else if (desconhecidos.length > 0) {
    r.push(
      v(
        'V3',
        'DESCONHECIDO',
        'Dados da Steam indisponíveis para checar conteúdo adulto.',
        'art. 17',
        'DECLARACAO_E_EVIDENCIA',
      ),
    )
  } else {
    r.push(v('V3', 'OK', 'Sem conteúdo só para adultos.', 'art. 17'))
  }
  if (nudez !== undefined) {
    r.push(
      v(
        'V4',
        'ALERTA',
        'A Steam indica nudez ou conteúdo sexual: declare que não é pornográfico.',
        'art. 17',
        'DECLARACAO',
      ),
    )
  }

  // V5 — entrada 01 (categoria pornográfica): declaração em todo aviso
  r.push(
    v(
      'V5',
      'ALERTA',
      'Declare que o jogo não é de conteúdo pornográfico (Anexo I, entrada 01).',
      'art. 17',
      'DECLARACAO',
    ),
  )

  // V6 — Family Sharing (categoria 62) em cada app (art. 16, I; art. 18; D-31)
  if (desconhecidos.length > 0) {
    r.push(
      v(
        'V6',
        'DESCONHECIDO',
        'Não foi possível confirmar o compartilhamento em família.',
        'art. 16, I',
        'DECLARACAO_E_EVIDENCIA',
      ),
    )
  } else if (apps.every((id) => loja(id)?.categorias.includes(62))) {
    r.push(v('V6', 'OK', 'Compartilhável em família (categoria 62).', 'art. 16, I'))
  } else {
    r.push(
      v(
        'V6',
        'ALERTA',
        'A loja não marca "Compartilhamento em família".',
        'art. 16, I; art. 18',
        'DECLARACAO_E_EVIDENCIA',
      ),
    )
  }

  // V7 — tipo e gratuito (art. 1º; art. 16, I; D-24)
  if (!principal) {
    r.push(
      v('V7', 'DESCONHECIDO', 'Tipo do produto desconhecido.', 'art. 1º', 'DECLARACAO_E_EVIDENCIA'),
    )
  } else if (principal.gratuito) {
    r.push(v('V7', 'BLOQUEIO', 'Jogo gratuito (F2P) não é compartilhável.', 'art. 16, I'))
  } else if (principal.tipo === 'music') {
    r.push(
      v(
        'V7',
        'ALERTA',
        'Trilha sonora: declare que é um conteúdo de jogo.',
        'art. 1º',
        'DECLARACAO',
      ),
    )
  } else if (!['game', 'dlc'].includes(principal.tipo)) {
    r.push(v('V7', 'BLOQUEIO', `Tipo "${principal.tipo}" não é jogo eletrônico.`, 'art. 1º'))
  } else {
    r.push(v('V7', 'OK', 'Jogo ou DLC pago.', 'art. 1º'))
  }

  // V8 — DLC de moeda/skin/itens ou de jogo F2P (art. 19, III; D-24)
  const baseF2P = base !== null && loja(base)?.gratuito === true
  if (ehDlc && (MOEDA.test(e.produto.nome) || MOEDA.test(principal?.nome ?? '') || baseF2P)) {
    r.push(
      v(
        'V8',
        'ALERTA',
        'DLC de moeda, skin, itens ou de jogo gratuito: declare que é conteúdo jogável.',
        'art. 19, III',
        'DECLARACAO',
      ),
    )
  }

  // V9 — o contemplado já possui (art. 16, II; art. 19, IV)
  if (ehDlc) {
    r.push(
      v(
        'V9',
        'DESCONHECIDO',
        'A Steam não lista DLCs: confirme que você não possui.',
        'art. 16, II',
        'DECLARACAO_E_EVIDENCIA',
      ),
    )
  } else if (!e.bibliotecaContemplado) {
    r.push(
      v(
        'V9',
        'DESCONHECIDO',
        'Sua biblioteca está privada ou não sincronizada.',
        'art. 16, II',
        'DECLARACAO_E_EVIDENCIA',
      ),
    )
  } else {
    const tem = apps.filter((id) => e.bibliotecaContemplado?.has(id))
    if (tem.length === apps.length)
      r.push(v('V9', 'BLOQUEIO', 'Você já possui este produto.', 'art. 16, II'))
    else if (tem.length > 0)
      r.push(v('V9', 'ALERTA', 'Você já possui parte do pacote.', 'art. 19, IV', 'DECLARACAO'))
    else r.push(v('V9', 'OK', 'Você não possui.', 'art. 16, II'))
  }

  // V10 — outro membro possui (art. 16, IV)
  const possuem = e.outros
    .filter((o) => o.biblioteca && apps.some((id) => o.biblioteca?.has(id)))
    .map((o) => o.apelido)
  const naoVerificaveis = ehDlc
    ? e.outros.map((o) => o.apelido)
    : e.outros.filter((o) => !o.biblioteca).map((o) => o.apelido)
  if (possuem.length > 0) {
    r.push(
      v(
        'V10',
        'ALERTA',
        `Já possui: ${possuem.join(', ')}. Exige autorização por votação.`,
        'art. 16, IV',
      ),
    )
  } else if (naoVerificaveis.length > 0) {
    r.push(v('V10', 'ALERTA', `Não verificável para ${naoVerificaveis.join(', ')}.`, 'art. 16, IV'))
  } else {
    r.push(v('V10', 'OK', 'Nenhum outro membro possui.', 'art. 16, IV'))
  }

  // V11 — janela × prazo (art. 20)
  if (e.janelaVetoAte >= e.prazoCompraAte) {
    r.push(v('V11', 'ALERTA', 'A autorização só sairia depois do prazo de compra.', 'art. 20'))
  } else if (e.prazoCompraAte.getTime() - e.agora.getTime() < QUATRO_DIAS_MS) {
    r.push(v('V11', 'ALERTA', 'Faltam menos de 96 h para o prazo de compra.', 'art. 20'))
  }

  // V12 — pré-venda
  if (apps.some((id) => loja(id)?.emBreve)) {
    r.push(v('V12', 'ALERTA', 'Produto em pré-venda.', 'art. 20'))
  }
  return r
}

/** Algum BLOQUEIO impede o aviso. */
export const bloqueia = (vs: readonly Validacao[]): boolean =>
  vs.some((x) => x.resultado === 'BLOQUEIO')

/** RN-COM-07: exige autorização 16 IV se V10 acusa posse ou alguém declarou "eu tenho". */
export const exige16IV = (
  validacoes: readonly Validacao[],
  declarantesPosse: readonly string[],
): boolean =>
  declarantesPosse.length > 0 ||
  validacoes.some(
    (x) => x.regra === 'V10' && x.resultado === 'ALERTA' && x.mensagem.startsWith('Já possui'),
  )

export type StatusAviso =
  | 'UTILIZADO'
  | 'VETADO'
  | 'NAO_AUTORIZADO_16IV'
  | 'SUBSTITUIDO'
  | 'EXPIRADO'
  | 'EM_VOTACAO_VETO'
  | 'JANELA_VETO'
  | 'AGUARDANDO_16IV'
  | 'AUTORIZADO'

type EstadoVotacao = {
  status: 'ABERTA' | 'APROVADA' | 'REJEITADA' | 'CANCELADA'
  encerradaEm: Date | null
}

export type FatosAviso = {
  substituidoEm: Date | null
  janelaVetoAte: Date
  prazoCompraAte: Date
  aquisicoesAtivas: number
  veto: EstadoVotacao | null
  votacoes16IV: readonly EstadoVotacao[]
  exige16IV: boolean
}

/** RN-COM-05: status derivado, nesta precedência; autorizadoEm quando autorizado. */
export function statusAviso(
  f: FatosAviso,
  agora: Date,
): { status: StatusAviso; autorizadoEm: Date | null } {
  const aprovada16 = f.votacoes16IV.find((x) => x.status === 'APROVADA')
  const rejeitada16 = f.votacoes16IV.find((x) => x.status === 'REJEITADA')
  const vetoRejeitado = f.veto?.status === 'REJEITADA'
  // fim da fase de veto: fim da janela sem veto, ou encerramento do veto rejeitado (RN-COM-08)
  const fimVeto = f.veto ? (vetoRejeitado ? f.veto.encerradaEm : null) : f.janelaVetoAte
  const autorizadoEm =
    fimVeto && agora >= fimVeto && (!f.exige16IV || aprovada16?.encerradaEm)
      ? new Date(Math.max(fimVeto.getTime(), aprovada16?.encerradaEm?.getTime() ?? 0))
      : null

  if (f.aquisicoesAtivas > 0) return { status: 'UTILIZADO', autorizadoEm }
  if (f.veto?.status === 'APROVADA') return { status: 'VETADO', autorizadoEm: null }
  if (rejeitada16 && !aprovada16) return { status: 'NAO_AUTORIZADO_16IV', autorizadoEm: null }
  if (f.substituidoEm) return { status: 'SUBSTITUIDO', autorizadoEm: null }
  if (agora >= f.prazoCompraAte) return { status: 'EXPIRADO', autorizadoEm: null }
  if (f.veto?.status === 'ABERTA') return { status: 'EM_VOTACAO_VETO', autorizadoEm: null }
  if (!f.veto && agora < f.janelaVetoAte) return { status: 'JANELA_VETO', autorizadoEm: null }
  if (f.exige16IV && !aprovada16) return { status: 'AGUARDANDO_16IV', autorizadoEm: null }
  return { status: 'AUTORIZADO', autorizadoEm }
}

/** RN-COM-06 (CA-54): o veto só pode ser convocado com a janela aberta. */
export const podeConvocarVeto = (janelaVetoAte: Date, agora: Date): boolean => agora < janelaVetoAte

/** RN-COM-09: aquisição ativa = não reembolsada integralmente. */
export const aquisicaoAtiva = (a: {
  valorCentavos: number
  reembolsoValorCentavos: number | null
}): boolean => a.reembolsoValorCentavos === null || a.reembolsoValorCentavos < a.valorCentavos

export type FatosCompra = {
  compradaEm: Date
  prazoCompraAte: Date
  aviso: {
    appId: number
    appIdsIncluidos: readonly number[]
    autorizadoEm: Date | null
    status: StatusAviso
    exige16IV: boolean
    aprovado16IV: boolean
  } | null
  appId: number
  vetoAberto: boolean
  cessaoEmVotacao: boolean
  bloqueadoNoAnexoI: boolean
  outrasAtivas: number
  multiplasPermitidas: boolean
  contaSteamId64: string
  steamIdContemplado: string | null
}

/** RN-COM-09 / D-10: a compra irregular é registrada mesmo assim, com as marcas. */
export function classificarAquisicao(f: FatosCompra): IrregularidadeAquisicao[] {
  const i: IrregularidadeAquisicao[] = []
  const a = f.aviso
  if (!a) i.push('SEM_AVISO')
  else {
    if (!a.autorizadoEm || a.autorizadoEm > f.compradaEm) i.push('ANTES_DA_AUTORIZACAO')
    if (f.appId !== a.appId && !a.appIdsIncluidos.includes(f.appId))
      i.push('PRODUTO_DIFERENTE_DO_AVISO')
    if (a.exige16IV && !a.aprovado16IV) i.push('SEM_AUTORIZACAO_16IV')
  }
  if (f.vetoAberto) i.push('DURANTE_VOTACAO_VETO')
  if (f.cessaoEmVotacao) i.push('DURANTE_VOTACAO_CESSAO')
  if (f.compradaEm >= f.prazoCompraAte) i.push('APOS_PRAZO')
  if (f.bloqueadoNoAnexoI) i.push('JOGO_BLOQUEADO')
  if (f.outrasAtivas > 0 && !f.multiplasPermitidas) i.push('SEGUNDA_AQUISICAO')
  if (f.steamIdContemplado && f.contaSteamId64 !== f.steamIdContemplado)
    i.push('CONTA_DIFERENTE_DO_CONTEMPLADO')
  return i
}
