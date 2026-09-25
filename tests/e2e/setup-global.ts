import { execFileSync } from 'node:child_process'

import { URLS_TESTE } from './urls'

// Recria o banco de teste e semeia os 5 fundadores antes de subir o servidor do E2E.
export default function setup() {
  execFileSync(
    './node_modules/.bin/tsx',
    ['--conditions=react-server', 'tests/e2e/preparar-banco.ts'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: URLS_TESTE.app,
        MIGRATE_DATABASE_URL: URLS_TESTE.dono,
        TEST_MIGRATE_DATABASE_URL: URLS_TESTE.dono,
      },
    },
  )
}
