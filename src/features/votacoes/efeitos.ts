import 'server-only'

import { aquisicaoAtiva } from '@/domain/compra'
import type { Efeito } from '@/domain/efeitos'
import { hashVersao } from '@/domain/hash'
import { numeroDaVersao, vigenciaDeAlteracao } from '@/domain/regulamento'
import { dataLocal, paraDb, prazoEmDias } from '@/domain/tempo'
import { fecharRodada } from '@/features/compra/fechamento'
import type { Contexto } from '@/server/auditoria'
import { registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'

/** Efeitos já implementados (os demais entram nos marcos M7, M8a e M8b). */
export const EFEITOS_DISPONIVEIS = [
  'NENHUM',
  'EXCLUSAO_BLOQUEIO',
  'VALIDAR_PAGAMENTO',
  'INVALIDAR_PAGAMENTO',
  'CANCELAR_OBRIGACAO',
  'CRIAR_DEVOLUCAO',
  'SUSPENDER_CONTRIBUICOES',
  'ALTERACAO_REGULAMENTO',
  'VETO_JOGO',
  'JOGO_DE_OUTRO_MEMBRO',
  'CONVERTER_PREMIO_EM_SOBRA',
  'REGULARIZAR_AQUISICAO',
  'PERMITIR_MULTIPLAS_AQUISICOES',
  'DESBLOQUEAR_CONTEUDO_ADULTO',
] as const satisfies readonly Efeito['tipo'][]

export const efeitoDisponivel = (t: Efeito['tipo']): boolean =>
  (EFEITOS_DISPONIVEIS as readonly string[]).includes(t)

const naoAplicavel = (motivo: string) => `não aplicável: ${motivo}`

/**
 * RN-VOT-07: aplica o efeito da votação APROVADA na mesma transação da ATA. Se a pré-condição
 * não vale mais, devolve "não aplicável: <motivo>" e a votação continua aprovada.
 */
export async function aplicarEfeito(
  tx: Tx,
  ctx: Contexto,
  efeito: Efeito,
  ataNumero: number,
  encerradaEm: Date,
  votacao: { justificativa: string } = { justificativa: '' },
): Promise<string> {
  const auditar = (entidade: string, entidadeId: string, dados?: Record<string, unknown>) =>
    registrarEvento(tx, ctx, {
      acao: `efeito.${efeito.tipo.toLowerCase()}`,
      entidade,
      entidadeId,
      dados: { depois: dados },
      ataNumero,
    })

  switch (efeito.tipo) {
    case 'NENHUM':
      return 'sem efeito no sistema'

    case 'EXCLUSAO_BLOQUEIO': {
      // RN-BLO-04: grava a exclusão e preserva o histórico; a protegida só por alteração do art. 17
      const b = await tx.jogoBloqueado.findUnique({ where: { numero: efeito.numero } })
      if (!b) return naoAplicavel(`entrada nº ${String(efeito.numero)} não existe`)
      if (b.protegida)
        return naoAplicavel('entrada protegida (art. 17): exige alteração do Regulamento')
      if (b.excluidoEm) return naoAplicavel('entrada já excluída')
      await tx.jogoBloqueado.update({
        where: { numero: b.numero },
        data: { excluidoEm: encerradaEm, ataExclusaoNumero: ataNumero },
      })
      await auditar('jogo_bloqueado', String(b.numero))
      return `aplicado: entrada nº ${String(b.numero).padStart(2, '0')} excluída do Anexo I`
    }

    case 'VALIDAR_PAGAMENTO':
    case 'INVALIDAR_PAGAMENTO': {
      const p = await tx.pagamento.findUnique({ where: { id: efeito.pagamentoId } })
      if (!p) return naoAplicavel('pagamento não existe')
      if (p.status === 'INVALIDADO') return naoAplicavel('pagamento já invalidado')
      const validar = efeito.tipo === 'VALIDAR_PAGAMENTO'
      await tx.pagamento.update({
        where: { id: p.id },
        data: validar
          ? { status: 'CONFIRMADO', confirmadoEm: encerradaEm, ataNumero }
          : { status: 'INVALIDADO', invalidadoEm: encerradaEm, ataNumero },
      })
      // ponytail: efeito recursivo sobre REPASSE/DEVOLUCAO (RN-FIN-05) entra no M8a
      await auditar('pagamento', p.id, { status: validar ? 'CONFIRMADO' : 'INVALIDADO' })
      return `aplicado: pagamento ${validar ? 'validado' : 'invalidado'}`
    }

    case 'CANCELAR_OBRIGACAO': {
      const o = await tx.obrigacao.findUnique({ where: { id: efeito.obrigacaoId } })
      if (!o) return naoAplicavel('obrigação não existe')
      if (o.canceladaEm) return naoAplicavel('obrigação já cancelada')
      await tx.obrigacao.update({
        where: { id: o.id },
        data: { canceladaEm: encerradaEm, motivoCancelamento: 'ata', ataNumero },
      })
      await auditar('obrigacao', o.id)
      return 'aplicado: obrigação cancelada'
    }

    case 'CRIAR_DEVOLUCAO': {
      if (efeito.devedorId === efeito.credorId) return naoAplicavel('devedor igual ao credor')
      const o = await tx.obrigacao.create({
        data: {
          tipo: 'DEVOLUCAO',
          rodadaId: efeito.rodadaId,
          devedorId: efeito.devedorId,
          credorId: efeito.credorId,
          valorCentavos: efeito.valorCentavos,
          vencimentoEm: prazoEmDias(dataLocal(encerradaEm), 7),
          criadaEm: encerradaEm,
          ataNumero,
        },
        select: { id: true },
      })
      await auditar('obrigacao', o.id, { valorCentavos: efeito.valorCentavos })
      return 'aplicado: devolução criada'
    }

    case 'SUSPENDER_CONTRIBUICOES': {
      const { count } = await tx.participacaoCiclo.updateMany({
        where: {
          pessoaId: efeito.pessoaId,
          cicloId: efeito.cicloId,
          contribuicoesSuspensas: false,
        },
        data: { contribuicoesSuspensas: true, ataSuspensaoNumero: ataNumero },
      })
      if (count === 0) return naoAplicavel('participação inexistente ou já suspensa')
      await auditar('participacao_ciclo', `${efeito.cicloId}:${efeito.pessoaId}`)
      return 'aplicado: contribuições suspensas no ciclo'
    }

    case 'ALTERACAO_REGULAMENTO': {
      // RN-REG-03: nova versão, vigente no dia 1º do mês seguinte ao encerramento (D-20)
      const ultima = await tx.versaoRegulamento.findFirstOrThrow({ orderBy: { ordem: 'desc' } })
      const ordem = ultima.ordem + 1
      const vigenteDesde = vigenciaDeAlteracao(encerradaEm)
      const v = await tx.versaoRegulamento.create({
        data: {
          ordem,
          numero: numeroDaVersao(ordem),
          textoMarkdown: efeito.texto,
          parametros: efeito.parametros,
          sha256: hashVersao(efeito.texto, efeito.parametros),
          resumoAlteracoes: efeito.resumo,
          ataNumero,
          aprovadaEm: encerradaEm,
          vigenteDesde,
        },
        select: { id: true, numero: true },
      })
      if (efeito.excluirEntradas.length > 0) {
        await tx.jogoBloqueado.updateMany({
          where: { numero: { in: efeito.excluirEntradas }, excluidoEm: null },
          data: { excluidoEm: vigenteDesde, ataExclusaoNumero: ataNumero },
        })
      }
      await auditar('versao_regulamento', v.id, { numero: v.numero, vigenteDesde })
      return `aplicado: versão ${v.numero} vigente a partir de 1º/${dataLocal(vigenteDesde).slice(5, 7)}`
    }

    case 'VETO_JOGO': {
      // RN-COM-06 / RN-BLO-02: entra no Anexo I com número novo (lock 'ata' já tomado)
      const aviso = await tx.avisoCompra.findUnique({ where: { id: efeito.avisoId } })
      if (!aviso) return naoAplicavel('aviso não existe')
      const { _max } = await tx.jogoBloqueado.aggregate({ _max: { numero: true } })
      const numero = (_max.numero ?? 0) + 1
      await tx.jogoBloqueado.create({
        data: {
          numero,
          tipo: 'JOGO',
          nome: aviso.nome,
          appIds: [...new Set([aviso.appId, ...aviso.appIdsIncluidos])],
          dataVeto: paraDb(dataLocal(encerradaEm)),
          motivo: votacao.justificativa,
          ataInclusaoNumero: ataNumero,
        },
      })
      await auditar('jogo_bloqueado', String(numero), { nome: aviso.nome })
      return `aplicado: ${aviso.nome} entrou no Anexo I (nº ${String(numero).padStart(2, '0')})`
    }

    case 'JOGO_DE_OUTRO_MEMBRO':
    case 'DESBLOQUEAR_CONTEUDO_ADULTO':
      // o status do aviso e a V3 leem a votação aprovada (RN-COM-05/07; RN-COM-04 V3)
      return 'aplicado: autorização registrada'

    case 'CONVERTER_PREMIO_EM_SOBRA': {
      // RN-FIN-13 (d): gasto 0 e só sem aquisição ativa; aguardando a anterior conta como aplicado
      const aquisicoes = await tx.aquisicao.findMany({
        where: { rodadaId: efeito.rodadaId },
        select: { valorCentavos: true, reembolsoValorCentavos: true },
      })
      if (aquisicoes.some(aquisicaoAtiva)) return naoAplicavel('a rodada tem aquisição ativa')
      const r = await fecharRodada(tx, ctx, efeito.rodadaId, 'CONVERTIDO_POR_ATA')
      if (r === 'NAO_FECHA') return naoAplicavel('a rodada não está aberta')
      return r === 'FECHADA'
        ? 'aplicado: rodada fechada com o prêmio como SOBRA'
        : 'aplicado: fecha quando a anterior fechar'
    }

    case 'REGULARIZAR_AQUISICAO': {
      const { count } = await tx.aquisicao.updateMany({
        where: { id: efeito.aquisicaoId, regularizadaAtaNumero: null },
        data: { regularizadaAtaNumero: ataNumero },
      })
      if (count === 0) return naoAplicavel('aquisição inexistente ou já regularizada')
      await auditar('aquisicao', efeito.aquisicaoId)
      return 'aplicado: aquisição regularizada'
    }

    case 'PERMITIR_MULTIPLAS_AQUISICOES': {
      await tx.rodada.update({
        where: { id: efeito.rodadaId },
        data: { multiplasAquisicoesAtaNumero: ataNumero },
      })
      await auditar('rodada', efeito.rodadaId)
      return 'aplicado: a rodada aceita mais de uma aquisição'
    }

    default:
      return naoAplicavel('efeito ainda não implementado')
  }
}
