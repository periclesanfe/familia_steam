import { defineConfig, devices } from '@playwright/test'

import { PORTA_E2E, URLS_TESTE } from './tests/e2e/urls'

// E2E contra `next dev` com DEV_LOGIN=1 (o build de produção desliga /api/auth/dev, RN-ACE-14),
// numa porta e num banco próprios (*_teste): não usa o banco nem o servidor de desenvolvimento.
const base = `http://localhost:${String(PORTA_E2E)}`

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './tests/e2e/setup-global.ts',
  use: { baseURL: base, trace: 'retain-on-failure', locale: 'pt-BR' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next dev -p ${String(PORTA_E2E)}`,
    url: base,
    reuseExistingServer: false,
    env: { DEV_LOGIN: '1', APP_URL: base, DATABASE_URL: URLS_TESTE.app },
  },
})
