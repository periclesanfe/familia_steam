import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'
import tseslint from 'typescript-eslint'

// docs/spec/08 §5.1. No flat config, redefinir uma regra substitui a anterior: repetir semEnumTs.
const semEnumTs = { selector: 'TSEnumDeclaration', message: 'Use enums do Prisma ou "as const".' }

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'src/generated/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      'import/order': [
        'error',
        {
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
        },
      ],
      'no-restricted-syntax': ['error', semEnumTs],
    },
  },
  {
    // Domínio puro: sem I/O, sem framework, relógio injetado.
    files: ['src/domain/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['next/*', 'react', '@/server/*', '@/features/*', '@prisma/*'] },
            {
              regex: '^@/generated/(?!prisma/enums$)',
              message: 'O domínio só importa @/generated/prisma/enums.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        semEnumTs,
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Injete "agora".',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Injete "agora".',
        },
      ],
    },
  },
  {
    // Código de cliente não acessa o servidor.
    files: ['src/components/**', 'src/lib/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@/server/*', '@/features/*/servico', '@/generated/*'] }] },
      ],
    },
  },
  {
    // Arquivos de config em JS/MJS não passam pelo type-checker.
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
])
