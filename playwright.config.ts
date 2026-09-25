import { defineConfig, devices } from '@playwright/test'

// E2E contra `pnpm dev` com DEV_LOGIN=1: o build de produção desliga /api/auth/dev (RN-ACE-14).
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure', locale: 'pt-BR' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    env: { DEV_LOGIN: '1' },
  },
})
