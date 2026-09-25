import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = fileURLToPath(new URL('./src', import.meta.url))
const vazio = fileURLToPath(new URL('./tests/vazio.ts', import.meta.url))

// docs/spec/08 §6: unit (domínio e parsers puros) × integracao (Postgres real, em série).
export default defineConfig({
  // server-only vira módulo vazio fora do Next (o import real lança erro em ambiente de cliente)
  resolve: { alias: { '@': src, 'server-only': vazio } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'integracao',
          include: ['tests/integracao/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integracao/setup-global.ts'],
          setupFiles: ['tests/integracao/setup-familia.ts'],
          // Banco próprio dos testes (criado por docker/initdb): o app como app_rw, a limpeza como dono.
          env: {
            DATABASE_URL:
              process.env.TEST_DATABASE_URL ??
              'postgresql://app_rw:app_rw@localhost:5433/consorcio_teste',
            MIGRATE_DATABASE_URL:
              process.env.TEST_MIGRATE_DATABASE_URL ??
              'postgresql://app_owner:app_owner@localhost:5433/consorcio_teste',
            APP_URL: 'http://localhost:3100',
          },
        },
      },
    ],
  },
})
