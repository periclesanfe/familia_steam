import { beforeEach, describe, expect, it } from 'vitest'

import { trilha } from '@/features/auditoria/consultas'

import { dono, limpar } from './banco'
import { prepararCiclo1 } from './fabricas'

describe('auditoria (07 §3.15, RN-ACE-07)', () => {
  beforeEach(async () => {
    await limpar()
  })

  it('filtra por ação, esconde sessões e pagina por cursor', async () => {
    await prepararCiclo1()
    await dono.eventoAuditoria.create({
      data: {
        ocorridoEm: new Date(),
        atorTipo: 'SISTEMA',
        acao: 'sessao.criar',
        entidade: 'sessao',
        entidadeId: 'x',
        dados: {},
      },
    })
    const tudo = await trilha({})
    expect(tudo.eventos.some((e) => e.entidade === 'sessao')).toBe(false)
    expect(tudo.entidades).not.toContain('sessao')
    const adesoes = await trilha({ acao: 'adesao.' })
    expect(adesoes.eventos).toHaveLength(5)
    expect(adesoes.eventos.every((e) => e.ator !== 'Sistema')).toBe(true)
    const total = await dono.eventoAuditoria.count({ where: { entidade: { not: 'sessao' } } })
    const pagina2 = await trilha({ antesDe: adesoes.eventos.at(-1)?.id })
    expect(pagina2.eventos.every((e) => e.id < (adesoes.eventos.at(-1)?.id ?? 0))).toBe(true)
    expect(total).toBeGreaterThan(5)
  })
})
