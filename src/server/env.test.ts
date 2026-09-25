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

  it('exige APP_URL https em produção, salvo localhost (14 SEG-02)', () => {
    const prod = { ...base, NODE_ENV: 'production' }
    expect(() => lerEnv({ ...prod, APP_URL: 'http://consorcio.exemplo.com' })).toThrow()
    expect(lerEnv({ ...prod, APP_URL: 'https://consorcio.exemplo.com' }).APP_URL).toBe(
      'https://consorcio.exemplo.com',
    )
    expect(lerEnv({ ...prod, APP_URL: 'http://localhost:3100' }).NODE_ENV).toBe('production')
  })
})
