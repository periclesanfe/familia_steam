import 'server-only'

import { aquisicaoAtiva } from '@/domain/compra'
import type { Efeito } from '@/domain/efeitos'
import { pagamentoConta } from '@/domain/financeiro'
import { hashVersao } from '@/domain/hash'
import {
  numeroDaVersao,
  parametrosSchema,
  versaoVigente,
  vigenciaDeAlteracao,
} from '@/domain/regulamento'
import { dataLocal, instanteLocal, mesDe, paraDb, prazoEmDias } from '@/domain/tempo'
import { aplicarCessao } from '@/features/cessao/efeito'
import { fecharRodada, ratearPendentesDoCiclo } from '@/features/compra/fechamento'
import { aplicarAdmissao, aplicarConvite, aplicarRemocao } from '@/features/familia/efeitos'
import { aoInvalidar, aoPassarAContar } from '@/features/financeiro/derivadas'
import { semCicloSeguinte } from '@/features/rodadas/ciclo'
import { encerrarMembro, registrarSaidaDaFamilia } from '@/features/saidas/servico'
import type { Contexto } from '@/server/auditoria'
import { registrarEvento } from '@/server/auditoria'
import type { Tx } from '@/server/db'

/** Efeitos já implementados (os demais entram nos marcos M7, M8a e M8b). */
export const EFEITOS_DISPONIVEIS = [
  'NENHUM',
  'EXCLUSAO_BLOQUEIO',
  'VALIDAR_PAGAMENTO',
  'CESSAO_VEZ',
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
  'PERMANENCIA_ART30',
  'RECONHECER_IMPOSSIBILIDADE',
  'RECONHECER_SAIDA',
  'RETORNO_SORTEIOS',
  'REVINCULAR_STEAM',
  'CONTINUIDADE_CONSORCIO',
  'ADIAR_CICLO',
  'ADMISSAO_MEMBRO',
  'CONVITE_INTEGRANTE',
  'REMOCAO_INTEGRANTE',
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
  votacao: { id: string; justificativa: string },
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
      // RN-FIN-05: invalidação cancela as derivadas; validação pode fazer o pagamento passar a contar
      if (!validar) await aoInvalidar(tx, ctx, p.id, ataNumero)
      else if (!pagamentoConta(p)) await aoPassarAContar(tx, ctx, p.id)
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

    case 'CESSAO_VEZ':
      return aplicarCessao(tx, ctx, efeito.cessaoId, ataNumero, encerradaEm) // RN-CES-05

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

    case 'PERMANENCIA_ART30': {
      // RN-SAI-06.5: aprovada exclui do consórcio (e, no escopo família, autoriza a remoção)
      const m = await tx.membro.findFirst({
        where: { pessoaId: efeito.pessoaId, status: 'IMPOSSIBILITADO' },
      })
      if (!m) return naoAplicavel('a pessoa não está impossibilitada')
      await encerrarMembro(tx, ctx, efeito.pessoaId, 'EXCLUSAO_ART30', encerradaEm, ataNumero)
      if (efeito.escopo === 'CONSORCIO_E_FAMILIA') {
        await tx.integranteFamilia.updateMany({
          where: { pessoaId: efeito.pessoaId, status: 'ATIVO' },
          data: { status: 'REMOCAO_AUTORIZADA', ataRemocaoNumero: ataNumero },
        })
      }
      return `aplicado: excluída do consórcio${efeito.escopo === 'CONSORCIO_E_FAMILIA' ? ' e remoção da família autorizada' : ''}`
    }

    case 'RECONHECER_IMPOSSIBILIDADE': {
      const { count } = await tx.membro.updateMany({
        where: { pessoaId: efeito.pessoaId, status: 'ATIVO' },
        data: { status: 'IMPOSSIBILITADO', impossibilitadoDesde: encerradaEm },
      })
      if (count === 0) return naoAplicavel('a pessoa não é membro ativo')
      await auditar('membro', efeito.pessoaId)
      return 'aplicado: impossibilidade reconhecida (art. 30)'
    }

    case 'RETORNO_SORTEIOS': {
      const { count } = await tx.membro.updateMany({
        where: { pessoaId: efeito.pessoaId, status: 'IMPOSSIBILITADO' },
        data: { status: 'ATIVO', impossibilitadoDesde: null },
      })
      if (count === 0) return naoAplicavel('a pessoa não está impossibilitada')
      await auditar('membro', efeito.pessoaId)
      return 'aplicado: volta a concorrer a partir do próximo sorteio'
    }

    case 'RECONHECER_SAIDA': {
      if (efeito.saida === 'SAIDA_FAMILIA')
        await registrarSaidaDaFamilia(tx, ctx, efeito.pessoaId, efeito.efetivaEm)
      const ok = await encerrarMembro(
        tx,
        ctx,
        efeito.pessoaId,
        efeito.saida === 'SAIDA_FAMILIA' ? 'SAIDA_DA_FAMILIA' : 'SAIDA_VOLUNTARIA',
        efeito.efetivaEm,
        ataNumero,
      )
      return ok ? 'aplicado: saída reconhecida' : naoAplicavel('a pessoa não tem vínculo aberto')
    }

    case 'REVINCULAR_STEAM': {
      // RN-ACE-16: troca a conta e revoga todas as sessões na mesma transação
      const ocupado = await tx.pessoa.findUnique({
        where: { steamId64: efeito.novoSteamId64 },
        select: { id: true },
      })
      if (ocupado && ocupado.id !== efeito.pessoaId)
        return naoAplicavel('o novo SteamID já pertence a outra pessoa')
      const antes = await tx.pessoa.findUnique({
        where: { id: efeito.pessoaId },
        select: { steamId64: true },
      })
      if (!antes) return naoAplicavel('pessoa inexistente')
      await tx.pessoa.update({
        where: { id: efeito.pessoaId },
        data: { steamId64: efeito.novoSteamId64 },
      })
      await tx.sessao.updateMany({
        where: { pessoaId: efeito.pessoaId, revogadaEm: null },
        data: { revogadaEm: encerradaEm },
      })
      if (efeito.incluirNaFamilia) {
        await tx.integranteFamilia.updateMany({
          where: { pessoaId: efeito.pessoaId, status: 'ATIVO' },
          data: { status: 'REMOCAO_AUTORIZADA', ataRemocaoNumero: ataNumero },
        })
        await tx.integranteFamilia.create({
          data: {
            pessoaId: efeito.pessoaId,
            steamId64: efeito.novoSteamId64,
            origem: 'CONVITE',
            status: 'CONVITE_AUTORIZADO',
            ataConviteNumero: ataNumero,
          },
        })
      }
      await auditar('pessoa', efeito.pessoaId, { steamId64: efeito.novoSteamId64 })
      return 'aplicado: conta Steam trocada e sessões revogadas; a pessoa assina de novo no próximo login'
    }

    case 'ADMISSAO_MEMBRO':
      return aplicarAdmissao(tx, ctx, efeito, ataNumero) // RN-CAD-12
    case 'CONVITE_INTEGRANTE':
      return aplicarConvite(tx, ctx, efeito, ataNumero) // RN-CAD-08
    case 'REMOCAO_INTEGRANTE':
      return aplicarRemocao(tx, ctx, efeito, ataNumero, encerradaEm) // RN-CAD-09

    case 'CONTINUIDADE_CONSORCIO': {
      // RN-CIC-10 (art. 38, p.u.)
      const [andamento, planejado] = await Promise.all([
        tx.ciclo.findFirst({ where: { status: 'EM_ANDAMENTO' }, select: { id: true } }),
        tx.ciclo.findFirst({
          where: { status: 'PLANEJADO', numero: { gt: 1 } },
          select: { id: true },
        }),
      ])
      if (!andamento) {
        // ciclo em revisão com o seguinte planejado: RN-CIC-07 na hora
        if (!planejado) return naoAplicavel('não há ciclo em andamento nem planejado')
        await semCicloSeguinte(tx, ctx, planejado.id, 'encerramento do consórcio', ataNumero)
        return 'aplicado: ciclo seguinte cancelado; consórcio encerrado com rateio das sobras'
      }
      if (efeito.acao === 'ENCERRAR_AO_FIM_DO_CICLO') {
        await tx.ciclo.update({
          where: { id: andamento.id },
          data: { semCicloSeguinte: true, ataEncerramentoNumero: ataNumero },
        })
        await auditar('ciclo', andamento.id, { semCicloSeguinte: true })
        return 'aplicado: o consórcio encerra ao fim do ciclo em andamento'
      }
      // ENCERRAR_IMEDIATAMENTE: sem restituições automáticas (ficam na ATA e em CRIAR_DEVOLUCAO)
      await tx.rodada.updateMany({
        where: { cicloId: andamento.id, status: 'AGENDADA' },
        data: { status: 'CANCELADA' },
      })
      await tx.ciclo.update({
        where: { id: andamento.id },
        data: {
          status: 'ENCERRADO',
          encerradoEm: encerradaEm,
          semCicloSeguinte: true,
          ataEncerramentoNumero: ataNumero,
        },
      })
      await ratearPendentesDoCiclo(tx, ctx, andamento.id)
      await auditar('ciclo', andamento.id, { status: 'ENCERRADO', imediato: true })
      return 'aplicado: ciclo encerrado imediatamente; rodadas agendadas canceladas'
    }

    case 'ADIAR_CICLO': {
      // RN-CIC-11: move o início de um ciclo PLANEJADO (sempre um dia 3), com a rodada 1
      const c = await tx.ciclo.findUnique({
        where: { id: efeito.cicloId },
        select: { status: true, rodadas: { where: { sequencia: 1, status: 'AGENDADA' } } },
      })
      const r1 = c?.rodadas[0]
      if (c?.status !== 'PLANEJADO' || !r1) return naoAplicavel('o ciclo não está planejado')
      const versoes = await tx.versaoRegulamento.findMany({
        select: { ordem: true, vigenteDesde: true, parametros: true },
      })
      const p = parametrosSchema.parse(versaoVigente(versoes, encerradaEm)?.parametros)
      const nova = efeito.novaDataInicio
      if (Number(nova.slice(8, 10)) !== p.diaSorteio) {
        return naoAplicavel(`a nova data precisa ser um dia ${String(p.diaSorteio)}`)
      }
      const agendadaPara = instanteLocal(nova, p.horaSorteio)
      if (agendadaPara <= encerradaEm) return naoAplicavel('a nova data já passou')
      await tx.ciclo.update({ where: { id: efeito.cicloId }, data: { dataInicio: paraDb(nova) } })
      await tx.rodada.update({
        where: { id: r1.id },
        data: { mesReferencia: mesDe(nova), agendadaPara },
      })
      await auditar('ciclo', efeito.cicloId, { dataInicio: nova })
      return `aplicado: o ciclo começa em ${nova.split('-').reverse().join('/')}`
    }

    default:
      return naoAplicavel('efeito ainda não implementado')
  }
}
