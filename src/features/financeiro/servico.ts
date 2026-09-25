import 'server-only'

import { ErroDeNegocio, exigir } from '@/domain/erros'
import { pagamentoConta, pagosAte, recebedores } from '@/domain/financeiro'
import { mascararPix } from '@/domain/mascara'
import type { MotivoContestacao } from '@/generated/prisma/enums'
import type { ContextoAcao } from '@/server/acao'
import { registrarEvento } from '@/server/auditoria'
import { emTransacao, travar } from '@/server/tx'

import { aoInvalidar, aoPassarAContar } from './derivadas'

/**
 * RN-FIN-04: registra um Pix numa obrigação. Pagador = devedor (derivado); recebedor = credor
 * vigente em `pixEm` (cessões) ou um dos cedentes escolhido. Registrado pelo recebedor nasce
 * CONFIRMADO; pelos demais, DECLARADO. Devolve alertas que não bloqueiam.
 */
export async function registrarPagamento(
  ctx: ContextoAcao,
  e: {
    obrigacaoId: string
    valor: number
    pixEm: Date
    anexoId?: string
    formaDiversa?: 'on'
    recebedorId?: string | undefined
  },
): Promise<{ pagamentoId: string; alertas: string[] }> {
  return emTransacao(async (tx) => {
    const previa = await tx.obrigacao.findUniqueOrThrow({
      where: { id: e.obrigacaoId },
      select: { rodadaId: true },
    })
    await travar(tx, `rodada:${previa.rodadaId}`) // dois registros simultâneos não passam do saldo
    const o = await tx.obrigacao.findUniqueOrThrow({
      where: { id: e.obrigacaoId },
      include: {
        pagamentos: { select: { status: true, formaDiversa: true, valorCentavos: true } },
        rodada: {
          select: {
            cessoes: {
              where: { status: 'APROVADA' },
              select: { cedenteId: true, encerradaEm: true },
            },
          },
        },
      },
    })
    const eu = ctx.ator.pessoaId
    // RN-FIN-04: devedor, credor ou qualquer membro; o EX_COM_PENDENCIA só nas próprias
    exigir(
      ctx.perfil.perfil === 'MEMBRO' || eu === o.devedorId || eu === o.credorId,
      'SEM_PERMISSAO',
    )
    exigir(!o.autoquitada, 'ENTRADA_INVALIDA', 'A parte do contemplado entra no prêmio sem Pix.')
    if (o.canceladaEm) {
      // RN-FIN-04: Pix feito antes do cancelamento por cessão/anulação ainda se registra (CA-155)
      exigir(
        ['cessao', 'anulacao'].includes(o.motivoCancelamento ?? '') && e.pixEm < o.canceladaEm,
        'ENTRADA_INVALIDA',
        'Esta obrigação foi cancelada.',
      )
    }
    exigir(e.valor <= o.valorCentavos - pagosAte(o.pagamentos), 'VALOR_ACIMA_DO_SALDO') // CA-38
    exigir(e.pixEm <= ctx.agora, 'ENTRADA_INVALIDA', 'A data do Pix não pode estar no futuro.')
    const cessoes = o.rodada.cessoes.flatMap((c) =>
      c.encerradaEm ? [{ cedenteId: c.cedenteId, encerradaEm: c.encerradaEm }] : [],
    )
    const { opcoes, padrao } = recebedores(o, cessoes, e.pixEm)
    const recebedorId = e.recebedorId ?? padrao
    exigir(opcoes.includes(recebedorId), 'ENTRADA_INVALIDA', 'Recebedor fora das opções.')
    exigir(recebedorId !== o.devedorId, 'ENTRADA_INVALIDA', 'Recebedor igual ao devedor.')

    const alertas: string[] = []
    let anexoNovo = false
    if (e.anexoId) {
      const anexo = await tx.anexo.findUniqueOrThrow({
        where: { id: e.anexoId },
        select: { enviadoPorId: true, entidade: true, entidadeId: true, sha256: true },
      })
      if (anexo.entidadeId === null) {
        // RN-ACE-09: só vincula anexo próprio e ainda solto
        exigir(
          anexo.enviadoPorId === eu,
          'SEM_PERMISSAO',
          'O comprovante precisa ter sido enviado por você.',
        )
        anexoNovo = true
      } else {
        // CA-34: reuso do mesmo comprovante só no mesmo par devedor/recebedor
        const mesmoPar = await tx.pagamento.count({
          where: { comprovanteId: e.anexoId, recebedorId, obrigacao: { devedorId: o.devedorId } },
        })
        exigir(mesmoPar > 0, 'SEM_PERMISSAO', 'Este comprovante pertence a outro pagamento.')
      }
      // CA-35: mesmo arquivo (hash) já usado em outro par
      const outroPar = await tx.pagamento.count({
        where: {
          comprovante: { sha256: anexo.sha256 },
          NOT: { recebedorId, obrigacao: { devedorId: o.devedorId } },
        },
      })
      if (outroPar > 0)
        alertas.push('Este comprovante já foi usado num pagamento entre outras pessoas.')
    }
    if (e.pixEm < o.criadaEm) alertas.push('A data do Pix é anterior à criação da obrigação.')

    const recebedor = await tx.pessoa.findUniqueOrThrow({
      where: { id: recebedorId },
      select: { chavePix: true },
    })
    const confirmado = eu === recebedorId
    const p = await tx.pagamento.create({
      data: {
        obrigacaoId: o.id,
        recebedorId,
        valorCentavos: e.valor,
        pixEm: e.pixEm,
        chavePixDestinoMascarada: recebedor.chavePix ? mascararPix(recebedor.chavePix) : null,
        formaDiversa: e.formaDiversa === 'on',
        status: confirmado ? 'CONFIRMADO' : 'DECLARADO',
        confirmadoEm: confirmado ? ctx.agora : null,
        comprovanteId: e.anexoId ?? null,
        registradoPorId: eu,
        registradoEm: ctx.agora,
      },
      select: { id: true, status: true, formaDiversa: true, valorCentavos: true },
    })
    if (pagamentoConta(p)) await aoPassarAContar(tx, ctx, p.id)
    if (e.anexoId && anexoNovo) {
      await tx.anexo.update({
        where: { id: e.anexoId },
        data: { entidade: 'pagamento', entidadeId: p.id },
      })
    }
    await registrarEvento(tx, ctx, {
      acao: 'pagamento.registrar',
      entidade: 'pagamento',
      entidadeId: p.id,
      dados: {
        depois: {
          obrigacaoId: o.id,
          recebedorId,
          valorCentavos: e.valor,
          pixEm: e.pixEm,
          status: p.status,
          alertas,
        },
      },
    })
    return { pagamentoId: p.id, alertas }
  })
}

type Transicao = 'CONFIRMAR' | 'CONTESTAR' | 'RETIRAR_CONTESTACAO' | 'CANCELAR'

/**
 * RN-FIN-05: só o recebedor confirma, contesta ou retira a contestação; só o devedor cancela
 * (→ INVALIDADO). Não existe confirmação tácita.
 */
export async function mudarPagamento(
  ctx: ContextoAcao,
  e: { pagamentoId: string; motivo?: MotivoContestacao; detalhe?: string | undefined },
  transicao: Transicao,
): Promise<void> {
  return emTransacao(async (tx) => {
    const previa = await tx.pagamento.findUniqueOrThrow({
      where: { id: e.pagamentoId },
      select: { obrigacao: { select: { rodadaId: true } } },
    })
    await travar(tx, `rodada:${previa.obrigacao.rodadaId}`)
    const p = await tx.pagamento.findUniqueOrThrow({
      where: { id: e.pagamentoId },
      include: { obrigacao: { select: { devedorId: true } } },
    })
    const eu = ctx.ator.pessoaId
    const doRecebedor = transicao !== 'CANCELAR'
    exigir(doRecebedor ? eu === p.recebedorId : eu === p.obrigacao.devedorId, 'SEM_PERMISSAO') // CA-121
    const permitido: Record<Transicao, string[]> = {
      CONFIRMAR: ['DECLARADO'],
      CONTESTAR: ['DECLARADO'],
      RETIRAR_CONTESTACAO: ['CONTESTADO'],
      CANCELAR: ['DECLARADO', 'CONTESTADO'],
    }
    exigir(permitido[transicao].includes(p.status), 'PAGAMENTO_EM_ESTADO_INVALIDO')
    const dados = {
      CONFIRMAR: { status: 'CONFIRMADO' as const, confirmadoEm: ctx.agora },
      CONTESTAR: {
        status: 'CONTESTADO' as const,
        contestadoEm: ctx.agora,
        motivoContestacao: e.motivo ?? null,
        detalheContestacao: e.detalhe ?? null,
      },
      RETIRAR_CONTESTACAO: { status: 'CONFIRMADO' as const, confirmadoEm: ctx.agora },
      CANCELAR: { status: 'INVALIDADO' as const, invalidadoEm: ctx.agora },
    }[transicao]
    await tx.pagamento.update({ where: { id: p.id }, data: dados })
    if (transicao === 'CANCELAR') await aoInvalidar(tx, ctx, p.id) // RN-FIN-05 (CA-159)
    // forma diversa só passa a contar quando o recebedor confirma (RN-FIN-06)
    if (!pagamentoConta(p) && pagamentoConta({ ...p, status: dados.status })) {
      await aoPassarAContar(tx, ctx, p.id)
    }
    await registrarEvento(tx, ctx, {
      acao: `pagamento.${transicao.toLowerCase()}`,
      entidade: 'pagamento',
      entidadeId: p.id,
      dados: { antes: { status: p.status }, depois: { status: dados.status } },
    })
  })
}

/** RN-FIN-03 depois do sorteio: vale se registrada antes do vencimento; +diasProrrogacao. */
export async function justificarObrigacao(
  ctx: ContextoAcao,
  e: { obrigacaoId: string; texto: string },
) {
  return emTransacao(async (tx) => {
    const o = await tx.obrigacao.findUniqueOrThrow({ where: { id: e.obrigacaoId } })
    await travar(tx, `rodada:${o.rodadaId}`)
    exigir(o.devedorId === ctx.ator.pessoaId, 'SEM_PERMISSAO', 'Só o devedor justifica.')
    exigir(!o.autoquitada && !o.canceladaEm, 'ENTRADA_INVALIDA')
    exigir(!o.justificadaEm, 'ENTRADA_INVALIDA', 'Esta obrigação já foi justificada.')
    if (ctx.agora >= o.vencimentoEm) throw new ErroDeNegocio('JUSTIFICATIVA_FORA_DO_PRAZO') // CA-16
    const d = await tx.declaracao.create({
      data: {
        tipo: 'JUSTIFICATIVA_PRORROGACAO',
        pessoaId: ctx.ator.pessoaId,
        obrigacaoId: o.id,
        texto: e.texto,
        efetivaEm: ctx.agora,
        registradaEm: ctx.agora,
        registradaPorId: ctx.ator.pessoaId,
      },
      select: { id: true },
    })
    await tx.obrigacao.update({
      where: { id: o.id },
      data: { justificativa: e.texto, justificadaEm: ctx.agora },
    })
    await registrarEvento(tx, ctx, {
      acao: 'obrigacao.justificar',
      entidade: 'obrigacao',
      entidadeId: o.id,
      dados: { depois: { declaracaoId: d.id, justificadaEm: ctx.agora } },
    })
  })
}
