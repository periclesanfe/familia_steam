import 'server-only'

import { pagamentoConta, type Situacao } from '@/domain/financeiro'
import { gradeDoCiclo, obrigacoesAbertas } from '@/features/financeiro/consultas'
import { nomeDoMes } from '@/features/grupo/textos'
import { db } from '@/server/db'

/**
 * 07 §3.3 (rev. M10): números e séries do painel, em número fixo de consultas (DP-02):
 * ciclo atual, arrecadação × prêmio por rodada, situação das contribuições, gasto × prêmio,
 * biblioteca por integrante e as contas da pessoa.
 */
export async function resumoDoPainel(pessoaId: string, agora: Date) {
  const ciclo = await db.ciclo.findFirst({
    where: { status: { in: ['EM_ANDAMENTO', 'PLANEJADO', 'EM_REVISAO'] } },
    orderBy: { numero: 'desc' },
    select: { id: true, numero: true },
  })
  const [grade, contribuicoes, rodadas, posses, abertas, proximo] = await Promise.all([
    ciclo ? gradeDoCiclo(ciclo.numero, agora) : null,
    ciclo
      ? db.obrigacao.findMany({
          where: { tipo: 'CONTRIBUICAO', canceladaEm: null, rodada: { cicloId: ciclo.id } },
          select: {
            rodadaId: true,
            valorCentavos: true,
            autoquitada: true,
            pagamentos: { select: { status: true, formaDiversa: true, valorCentavos: true } },
          },
        })
      : [],
    ciclo
      ? db.rodada.findMany({
          where: { cicloId: ciclo.id, status: { in: ['CONTEMPLADA', 'FECHADA'] } },
          orderBy: { sequencia: 'asc' },
          select: {
            id: true,
            sequencia: true,
            mesReferencia: true,
            status: true,
            contribuicaoCentavos: true,
            pagantesNoCorte: true,
            gastoCentavos: true,
            prazoCompraAte: true,
            contemplado: { select: { apelido: true } },
          },
        })
      : [],
    db.jogoPossuido.findMany({
      where: { pessoa: { integrantes: { some: { status: 'ATIVO' } } } },
      select: { appId: true, pessoa: { select: { apelido: true } } },
    }),
    obrigacoesAbertas(agora, { pessoaId }),
    db.rodada.findFirst({
      where: { status: 'AGENDADA' },
      orderBy: { agendadaPara: 'asc' },
      select: { id: true, agendadaPara: true, sequencia: true, mesReferencia: true },
    }),
  ])

  const arrecadado = new Map<string, number>()
  for (const o of contribuicoes) {
    const pago = o.autoquitada
      ? o.valorCentavos
      : Math.min(
          o.valorCentavos,
          o.pagamentos.filter(pagamentoConta).reduce((s, p) => s + p.valorCentavos, 0),
        )
    arrecadado.set(o.rodadaId, (arrecadado.get(o.rodadaId) ?? 0) + pago)
  }
  const porRodada = rodadas.map((r) => ({
    rodada: nomeDoMes(r.mesReferencia).slice(0, 3),
    premio: ((r.contribuicaoCentavos ?? 0) * (r.pagantesNoCorte ?? 0)) / 100,
    arrecadado: (arrecadado.get(r.id) ?? 0) / 100,
    gasto: (r.gastoCentavos ?? 0) / 100,
  }))

  const situacoes = new Map<Situacao, number>()
  for (const s of Object.values(grade?.situacaoDe ?? {})) {
    situacoes.set(s, (situacoes.get(s) ?? 0) + 1)
  }

  const porPessoa = new Map<string, number>()
  for (const p of posses)
    porPessoa.set(p.pessoa.apelido, (porPessoa.get(p.pessoa.apelido) ?? 0) + 1)

  const atual = rodadas.findLast((r) => r.status === 'CONTEMPLADA') ?? null
  const contemplados = grade?.rodadas.filter((r) => r.contemplado).length ?? 0
  return {
    ciclo: ciclo
      ? { numero: ciclo.numero, contemplados, participantes: grade?.participantes.length ?? 0 }
      : null,
    atual: atual
      ? {
          id: atual.id,
          mes: nomeDoMes(atual.mesReferencia),
          contemplado: atual.contemplado?.apelido ?? '—',
          premioCentavos: (atual.contribuicaoCentavos ?? 0) * (atual.pagantesNoCorte ?? 0),
          arrecadadoCentavos: arrecadado.get(atual.id) ?? 0,
          prazoCompraAte: atual.prazoCompraAte,
        }
      : null,
    proximo,
    contas: {
      devo: abertas
        .filter((o) => o.devedorId === pessoaId)
        .reduce((s, o) => s + o.saldoCentavos, 0),
      aReceber: abertas
        .filter((o) => o.credorId === pessoaId)
        .reduce((s, o) => s + o.saldoCentavos, 0),
    },
    series: {
      porRodada,
      situacoes: [...situacoes.entries()].map(([situacao, total]) => ({ situacao, total })),
      biblioteca: [...porPessoa.entries()]
        .map(([pessoa, jogos]) => ({ pessoa, jogos }))
        .sort((a, b) => b.jogos - a.jogos),
      jogosUnicos: new Set(posses.map((p) => p.appId)).size,
    },
  }
}
