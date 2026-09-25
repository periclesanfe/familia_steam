import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = fileURLToPath(new URL('./src', import.meta.url))
const vazio = fileURLToPath(new URL('./tests/vazio.ts', import.meta.url))

// docs/spec/08 §6: unit (domínio e parsers puros) × integracao (Postgres real, em série).
export default defineConfig({
  resolve: { alias: { '@': src } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        resolve: { alias: { 'server-only': vazio } },
        test: {
          name: 'integracao',
          include: ['tests/integracao/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
