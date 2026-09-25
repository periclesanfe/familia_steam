import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instanteLocal } from '@/domain/tempo'
import { registrarExecucao } from '@/features/familia/servico'
import { dadosCadastroSchema } from '@/features/onboarding/schemas'
import { assinarRegulamento, salvarDados } from '@/features/onboarding/servico'
import { responderProximoCiclo } from '@/features/rodadas/janela'
import { executarRodada } from '@/features/rodadas/servico'
import { convocar, votar } from '@/features/votacoes/servico'

import { dono, limpar } from './banco'
import { ctxDe, pagarTudo, prepararCiclo1, STEAMS } from './fabricas'

const agora = () => new Date()
const hora = (dia: string, h = '12:00') => {
  vi.setSystemTime(instanteLocal(dia, h))
}
const DIAS = ['2026-10-03', '2026-11-03', '2026-12-03', '2027-01-03', '2027-02-03']
const FABI = '76561197960287940'
const GIL = '76561197960287941'

async function sortear(i: number) {
  const dia = DIAS[i] ?? ''
  hora(dia)
  const r = await dono.rodada.findFirstOrThrow({ where: { sequencia: i + 1, status: 'AGENDADA' } })
  await executarRodada(r.id, null, () => 0)
  await pagarTudo(instanteLocal(dia, '18:00'))
}

async function aprovar(ids: string[], e: Parameters<typeof convocar>[1]) {
  const [a = '', b = '', c = ''] = ids
  const { votacaoId } = await convocar(ctxDe(a, agora()), e)
  for (const x of [a, b, c]) await votar(ctxDe(x, agora()), { votacaoId, opcao: 'FAVOR' })
  return dono.votacao.findUniqueOrThrow({ where: { id: votacaoId } })
}

const admitir = (ids: string[], nome: string, steamId64: string) =>
  aprovar(ids, {
    assunto: 'ADMISSAO_MEMBRO',
    proposicao: `Admitir ${nome}`,
    justificativa: 'Amigo da família',
    efeito: { tipo: 'ADMISSAO_MEMBRO', nome, steamId64, incluirNaFamilia: true },
  })

const pessoaDo = (steamId64: string) => dono.pessoa.findUniqueOrThrow({ where: { steamId64 } })

async function aderir(pessoaId: string) {
  await salvarDados(
    ctxDe(pessoaId, agora()),
    dadosCadastroSchema.parse({
      nome: 'Fabi Souza',
      apelido: 'Fabi',
      tipoChavePix: 'ALEATORIA',
      chavePix: '123e4567-e89b-12d3-a456-426614174099',
      maioridade: 'on',
    }),
  )
  await assinarRegulamento(ctxDe(pessoaId, agora()))
}

/** Fabi e Gil admitidos no mês 2; Fabi assina e tem o convite executado; ciclo 1 concluído. */
async function comAdmitidos() {
  const ids = await prepararCiclo1()
  await sortear(0)
  await sortear(1)
  hora('2026-11-10')
  await admitir(ids, 'Fabi Souza', FABI)
  await admitir(ids, 'Gil Lima', GIL)
  const fabi = await pessoaDo(FABI)
  const gil = await pessoaDo(GIL)
  expect(await dono.membro.findFirstOrThrow({ where: { pessoaId: fabi.id } })).toMatchObject({
    origem: 'ADMISSAO',
    status: 'AGUARDANDO_ADESAO',
  })
  await aderir(fabi.id)
  expect((await dono.membro.findFirstOrThrow({ where: { pessoaId: fabi.id } })).status).toBe(
    'AGUARDANDO_CICLO',
  )
  const convite = await dono.integranteFamilia.findFirstOrThrow({ where: { pessoaId: fabi.id } })
  await registrarExecucao(ctxDe(ids[0] ?? '', agora()), {
    integranteId: convite.id,
    executadaEm: '2026-11-10',
  })
  for (const i of [2, 3, 4]) await sortear(i)
  const c2 = await dono.ciclo.findUniqueOrThrow({
    where: { numero: 2 },
    include: { rodadas: true },
  })
  return { ids, fabi, gil, c2, r1: c2.rodadas[0]?.id ?? '' }
}

describe('família e admissão (RN-CAD-08/09/11/12/13)', () => {
  beforeEach(async () => {
    await limpar()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CA-93: admitido assina → AGUARDANDO_CICLO → ATIVO no 1º corte seguinte; quem não assinou caduca', async () => {
    const { ids, fabi, gil, c2, r1 } = await comAdmitidos()
    hora('2027-02-10')
    for (const x of ids.slice(1)) {
      await responderProximoCiclo(ctxDe(x, agora()), { cicloId: c2.id, confirma: true })
    }
    hora('2027-03-03')
    await executarRodada(r1, null, () => 0)
    expect(await dono.membro.findFirstOrThrow({ where: { pessoaId: fabi.id } })).toMatchObject({
      status: 'ATIVO',
    })
    expect(
      await dono.participacaoCiclo.count({ where: { cicloId: c2.id, pessoaId: fabi.id } }),
    ).toBe(1)
    expect(await dono.membro.findFirstOrThrow({ where: { pessoaId: gil.id } })).toMatchObject({
      status: 'ENCERRADO',
      motivoEncerramento: 'ADMISSAO_CADUCOU',
    })
    expect(
      (await dono.integranteFamilia.findFirstOrThrow({ where: { pessoaId: gil.id } })).status,
    ).toBe('CONVITE_CADUCOU')
  })

  it('CA-94: 5 confirmados + admitido com membrosPrevistos = 5 → a ativação fica para o ciclo seguinte', async () => {
    const { ids, fabi, c2, r1 } = await comAdmitidos()
    hora('2027-02-10')
    for (const x of ids) {
      await responderProximoCiclo(ctxDe(x, agora()), { cicloId: c2.id, confirma: true })
    }
    hora('2027-03-03')
    await executarRodada(r1, null, () => 0)
    expect(await dono.participacaoCiclo.count({ where: { cicloId: c2.id } })).toBe(5)
    expect((await dono.membro.findFirstOrThrow({ where: { pessoaId: fabi.id } })).status).toBe(
      'AGUARDANDO_CICLO',
    )
  })

  it('CA-145: admitido assina às 10:00 do dia 3 (prazo 00:00) → recusado; caduca no corte', async () => {
    const ids = await prepararCiclo1()
    for (const i of [0, 1, 2, 3, 4]) await sortear(i)
    hora('2027-02-20')
    await admitir(ids, 'Fabi Souza', FABI)
    const fabi = await pessoaDo(FABI)
    hora('2027-03-03', '10:00')
    await expect(aderir(fabi.id)).rejects.toMatchObject({ codigo: 'ENTRADA_INVALIDA' })
    hora('2027-03-03')
    const r1 = await dono.rodada.findFirstOrThrow({
      where: { ciclo: { numero: 2 }, sequencia: 1 },
    })
    await executarRodada(r1.id, null, () => 0)
    expect(
      (await dono.membro.findFirstOrThrow({ where: { pessoaId: fabi.id } })).motivoEncerramento,
    ).toBe('ADMISSAO_CADUCOU')
  })

  it('CA-46 e CA-95: convite e remoção executados na Steam; admissão de quem já é membro não se aplica', async () => {
    const ids = await prepararCiclo1()
    hora('2026-10-01')
    await aprovar(ids, {
      assunto: 'CONVITE_INTEGRANTE',
      proposicao: 'Convidar o Kid para a família',
      justificativa: 'Conta infantil',
      efeito: { tipo: 'CONVITE_INTEGRANTE', apelido: 'Kid' },
    })
    const kid = await dono.integranteFamilia.findFirstOrThrow({
      where: { pessoa: { apelido: 'Kid' } },
    })
    expect(kid.status).toBe('CONVITE_AUTORIZADO')
    await registrarExecucao(ctxDe(ids[1] ?? '', agora()), {
      integranteId: kid.id,
      executadaEm: '2026-10-01',
    })
    hora('2026-10-20')
    await aprovar(ids, {
      assunto: 'REMOCAO_INTEGRANTE',
      proposicao: 'Remover o Kid da família',
      justificativa: 'Pedido do responsável',
      efeito: { tipo: 'REMOCAO_INTEGRANTE', integranteId: kid.id, pessoaId: kid.pessoaId },
    })
    await expect(
      registrarExecucao(ctxDe(ids[1] ?? '', agora()), {
        integranteId: kid.id,
        executadaEm: '2026-10-25',
      }),
    ).rejects.toMatchObject({ codigo: 'ENTRADA_INVALIDA' }) // data no futuro
    await registrarExecucao(ctxDe(ids[1] ?? '', agora()), {
      integranteId: kid.id,
      executadaEm: '2026-10-20',
    })
    const removido = await dono.integranteFamilia.findUniqueOrThrow({ where: { id: kid.id } })
    expect(removido.status).toBe('REMOVIDO')
    expect(removido.saiuEm?.toISOString().slice(0, 10)).toBe('2026-10-20')
    expect(removido.vagaBloqueadaAte?.toISOString().slice(0, 10)).toBe('2027-10-01')

    const v = await admitir(ids, 'Ana de novo', STEAMS[0] ?? '') // CA-95
    expect(v.efeitoNaoAplicavel).toContain('vínculo de membro aberto')
    expect(await dono.membro.count()).toBe(5)
  })
})
