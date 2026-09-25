import { beforeEach, describe, expect, it } from 'vitest'

import { salvarAnexo } from '@/server/anexos'
import { db } from '@/server/db'
import { emTransacao } from '@/server/tx'

import { criarPessoa, dono, limpar } from './banco'

describe('salvarAnexo (RN-ACE-09)', () => {
  beforeEach(limpar)

  it('grava pelo mime detectado, com sha256 e auditoria; bytes só quando pedidos', async () => {
    const p = await criarPessoa()
    const ctx = { ator: { tipo: 'MEMBRO' as const, pessoaId: p.id }, agora: new Date() }
    const arquivo = new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], 'x.png', {
      type: 'image/png', // o que o cliente diz é ignorado
    })
    const { id } = await emTransacao((tx) => salvarAnexo(tx, ctx, 'COMPROVANTE_PIX', arquivo))

    const semBytes = await db.anexo.findUniqueOrThrow({ where: { id } })
    expect(semBytes).toMatchObject({ mime: 'image/jpeg', tamanhoBytes: 5, entidade: null })
    expect('conteudo' in semBytes).toBe(false) // omit global (13 DP-04)
    const comBytes = await db.anexo.findUniqueOrThrow({
      where: { id },
      omit: { conteudo: false },
    })
    expect(comBytes.conteudo?.length).toBe(5)
    expect(await dono.eventoAuditoria.count({ where: { acao: 'anexo.enviar' } })).toBe(1)
  })

  it('CA-106: SVG é recusado e nada é gravado', async () => {
    const p = await criarPessoa()
    const ctx = { ator: { tipo: 'MEMBRO' as const, pessoaId: p.id }, agora: new Date() }
    const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })
    await expect(
      emTransacao((tx) => salvarAnexo(tx, ctx, 'COMPROVANTE_PIX', svg)),
    ).rejects.toMatchObject({ codigo: 'ENTRADA_INVALIDA' })
    expect(await dono.anexo.count()).toBe(0)
  })
})
