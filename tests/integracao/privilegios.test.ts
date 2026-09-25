import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/server/db'

import { dono, limpar } from './banco'

// CA-171 / 14 SEG-08 e CA-87 (trigger): append-only por privilégio e por trigger.
describe('privilégios do app_rw', () => {
  beforeEach(limpar)

  it('o app não é dono: não altera, não apaga e não trunca tabelas append-only', async () => {
    await db.eventoAuditoria.create({
      data: {
        ocorridoEm: new Date(),
        atorTipo: 'SISTEMA',
        acao: 'teste',
        entidade: 't',
        entidadeId: '1',
        dados: {},
      },
    })
    await expect(db.$executeRaw`UPDATE evento_auditoria SET acao = 'x'`).rejects.toThrow(
      /permission denied/,
    )
    await expect(db.$executeRaw`DELETE FROM voto`).rejects.toThrow(/permission denied/)
    await expect(db.$executeRaw`TRUNCATE ata`).rejects.toThrow(/permission denied/)
    await expect(db.$executeRaw`DELETE FROM obrigacao`).rejects.toThrow(/permission denied/)
    await expect(db.$queryRaw`SELECT 1 FROM "_prisma_migrations"`).rejects.toThrow(
      /permission denied/,
    )
  })

  it('o app altera tabelas mutáveis (controle)', async () => {
    const n = await db.$executeRaw`UPDATE controle SET valor = NULL WHERE chave = 'tick'`
    expect(n).toBe(1)
  })

  it('até o dono esbarra no trigger de imutabilidade', async () => {
    await dono.eventoAuditoria.create({
      data: {
        ocorridoEm: new Date(),
        atorTipo: 'SISTEMA',
        acao: 'teste',
        entidade: 't',
        entidadeId: '1',
        dados: {},
      },
    })
    await expect(dono.$executeRaw`UPDATE evento_auditoria SET acao = 'x'`).rejects.toThrow()
  })
})
