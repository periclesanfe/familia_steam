import { describe, expect, it } from 'vitest'

import { lerEnv } from './env'

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5433/db' }

describe('lerEnv', () => {
  it('trata variáveis vazias como ausentes', () => {
    const e = lerEnv({ ...base, STEAM_API_KEY: '', CRON_SECRET: '' })
    expect(e.STEAM_API_KEY).toBeUndefined()
    expect(e.CRON_SECRET).toBeUndefined()
  })

  it('exige CRON_SECRET com pelo menos 32 caracteres', () => {
    expect(() => lerEnv({ ...base, CRON_SECRET: 'curto' })).toThrow()
  })

  it('recusa DEV_LOGIN=1 em produção (RN-ACE-14)', () => {
    expect(() => lerEnv({ ...base, NODE_ENV: 'production', DEV_LOGIN: '1' })).toThrow()
  })
})
