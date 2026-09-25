import 'server-only'

import { dataLocal, deDb, prazoConfirmacao } from '@/domain/tempo'
import { formatarDataCivil, formatarDataHora } from '@/lib/formato'
import { db } from '@/server/db'

export type Pendencia = { chave: string; texto: string; href: string; urgente?: boolean }

const APTOS = { in: ['ATIVO' as const, 'IMPOSSIBILITADO' as const] }
const antesDe = (t: Date) => formatarDataHora(new Date(t.getTime() - 60_000))

/**
 * 07 §4: pendências derivadas do estado (sem tabela de notificações), em número fixo de consultas
 * (13 DP-02). Pagar/confirmar recebimento e atos transcritos têm cartões próprios no painel.
 */
export async function pendenciasDe(pessoaId: string, agora: Date) {
  const [
    pessoa,
    votacoes,
    contempladas,
    cessoes,
    planejado,
    impossibilitados,
    semContemplado,
    contestados,
    integrantes,
    versoes,
    irregulares,
    vencidas,
  ] = await Promise.all([
    db.pessoa.findUniqueOrThrow({
      where: { id: pessoaId },
      select: {
        steamJogosPublicos: true,
        membros: { where: { status: APTOS }, select: { id: true } },
      },
    }),
    db.votacao.findMany({
      where: {
        status: 'ABERTA',
        encerraEm: { gt: agora },
        eleitoresIds: { has: pessoaId },
        NOT: { impedidosIds: { has: pessoaId } },
        votos: { none: { pessoaId } },
      },
      select: { id: true, proposicao: true, encerraEm: true },
    }),
    db.rodada.findMany({
      where: { contempladoId: pessoaId, status: 'CONTEMPLADA' },
      select: {
        id: true,
        sequencia: true,
        prazoCompraAte: true,
        avisos: { where: { substituidoEm: null }, select: { id: true } },
        aquisicoes: { select: { id: true, verificacaoBiblioteca: true } },
      },
    }),
    db.cessao.findMany({
      where: { beneficiarioId: pessoaId, status: 'AGUARDANDO_ACEITE' },
      select: { rodadaId: true, cedente: { select: { apelido: true } } },
    }),
    db.ciclo.findFirst({
      where: { status: 'PLANEJADO', numero: { gt: 1 } },
      select: {
        numero: true,
        dataInicio: true,
        declaracoes: {
          where: {
            pessoaId,
            revogadaEm: null,
            tipo: { in: ['CONFIRMA_PROXIMO_CICLO', 'RECUSA_PROXIMO_CICLO'] },
          },
          select: { id: true },
        },
      },
    }),
    db.membro.findMany({
      where: { status: 'IMPOSSIBILITADO' },
      select: { pessoaId: true, pessoa: { select: { apelido: true } } },
    }),
    db.rodada.findMany({
      where: {
        ciclo: { status: 'EM_ANDAMENTO' },
        status: { in: ['CONTEMPLADA', 'SEM_CONTEMPLADO', 'FECHADA'] },
      },
      orderBy: { sequencia: 'desc' },
      take: 2,
      select: { status: true },
    }),
    db.pagamento.count({ where: { status: 'CONTESTADO' } }),
    db.integranteFamilia.findMany({
      where: { status: { in: ['CONVITE_AUTORIZADO', 'REMOCAO_AUTORIZADA'] } },
      select: { status: true, pessoa: { select: { apelido: true } } },
    }),
    db.versaoRegulamento.findMany({
      where: { vigenteDesde: { gt: agora } },
      select: { numero: true, vigenteDesde: true },
    }),
    db.aquisicao.findMany({
      where: { irregularidades: { isEmpty: false }, regularizadaAtaNumero: null },
      select: { rodadaId: true, rodada: { select: { sequencia: true } } },
    }),
    db.rodada.findMany({
      where: { status: 'CONTEMPLADA', prazoCompraAte: { lte: agora }, aquisicoes: { none: {} } },
      select: { id: true, sequencia: true },
    }),
  ])
  const souMembro = pessoa.membros.length > 0

  const minhas: Pendencia[] = []
  for (const v of votacoes) {
    minhas.push({
      chave: `votar-${v.id}`,
      texto: `Votar até ${antesDe(v.encerraEm)}: ${v.proposicao}`,
      href: `/votacoes/${v.id}`,
      urgente: true,
    })
  }
  for (const r of contempladas) {
    const jogo = `/rodadas/${r.id}?aba=jogo`
    if (r.aquisicoes.length > 0) {
      minhas.push({ chave: `concluir-${r.id}`, texto: 'Conclua a aquisição do jogo', href: jogo })
      if (r.aquisicoes.some((a) => a.verificacaoBiblioteca === 'NAO_VERIFICAVEL')) {
        minhas.push({
          chave: `print-${r.id}`,
          texto: 'Anexe o print da biblioteca: a Steam não confirmou a posse',
          href: jogo,
        })
      }
    } else if (r.avisos.length === 0) {
      minhas.push({
        chave: `avisar-${r.id}`,
        texto: `Você foi contemplado na rodada ${String(r.sequencia)}: avise o jogo${r.prazoCompraAte ? ` (compra até ${antesDe(r.prazoCompraAte)})` : ''}`,
        href: jogo,
        urgente: true,
      })
    } else {
      minhas.push({
        chave: `comprar-${r.id}`,
        texto: `Acompanhe a autorização e compre até ${r.prazoCompraAte ? antesDe(r.prazoCompraAte) : '—'}`,
        href: jogo,
      })
    }
  }
  for (const c of cessoes) {
    minhas.push({
      chave: `cessao-${c.rodadaId}`,
      texto: `${c.cedente.apelido} quer ceder a vez a você: aceite ou recuse`,
      href: `/rodadas/${c.rodadaId}?aba=cessao`,
      urgente: true,
    })
  }
  if (
    souMembro &&
    planejado?.declaracoes.length === 0 &&
    agora < prazoConfirmacao(deDb(planejado.dataInicio))
  ) {
    minhas.push({
      chave: 'confirmar-ciclo',
      texto: `Confirme se participa do ciclo ${String(planejado.numero)} até ${antesDe(prazoConfirmacao(deDb(planejado.dataInicio)))}`,
      href: `/ciclos/${String(planejado.numero - 1)}`,
      urgente: true,
    })
  }
  if (pessoa.steamJogosPublicos === false) {
    minhas.push({
      chave: 'steam-privado',
      texto: 'Sua biblioteca Steam está privada: a verificação de posse fica manual',
      href: '/perfil',
    })
  }

  const grupo: Pendencia[] = []
  for (const m of impossibilitados) {
    grupo.push({
      chave: `art30-${m.pessoaId}`,
      texto: `${m.pessoa.apelido} está impossibilitado de pagar: deliberar permanência (art. 30)`,
      href: '/votacoes/nova',
    })
  }
  if (semContemplado.length === 2 && semContemplado.every((r) => r.status === 'SEM_CONTEMPLADO')) {
    grupo.push({
      chave: 'sem-contemplado',
      texto: 'Duas rodadas seguidas sem contemplado: deliberar caso omisso',
      href: '/votacoes/nova',
    })
  }
  if (contestados > 0) {
    grupo.push({
      chave: 'contestados',
      texto: `${String(contestados)} pagamento(s) contestado(s): validar ou invalidar por caso omisso`,
      href: '/votacoes/nova',
    })
  }
  for (const i of integrantes) {
    grupo.push({
      chave: `integrante-${i.pessoa.apelido}`,
      texto: `${i.status === 'CONVITE_AUTORIZADO' ? 'Convite' : 'Remoção'} de ${i.pessoa.apelido} aguardando execução na Steam`,
      href: '/familia',
    })
  }
  for (const a of irregulares) {
    grupo.push({
      chave: `irregular-${a.rodadaId}`,
      texto: `Aquisição irregular na rodada ${String(a.rodada.sequencia)}: regularizar por caso omisso`,
      href: `/rodadas/${a.rodadaId}?aba=jogo`,
    })
  }
  for (const r of vencidas) {
    grupo.push({
      chave: `vencida-${r.id}`,
      texto: `Rodada ${String(r.sequencia)}: prazo de compra vencido sem aquisição (caso omisso)`,
      href: `/rodadas/${r.id}?aba=jogo`,
    })
  }
  for (const v of versoes) {
    if (!v.vigenteDesde) continue
    grupo.push({
      chave: `versao-${v.numero}`,
      texto: `A versão ${v.numero} do Regulamento entra em vigor em ${formatarDataCivil(dataLocal(v.vigenteDesde))}`,
      href: '/regulamento',
    })
  }
  // ponytail: "anexar captura do sorteio" depende da decisão D-03 (03 §3.2); "divergência de
  // conservação" e "contemplado fora da família" entram quando houver o relatório do RN-FIN-18.
  return { minhas, grupo: souMembro ? grupo : [] }
}
