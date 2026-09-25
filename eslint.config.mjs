import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'
import tseslint from 'typescript-eslint'

// docs/spec/08 §5.1. No flat config, redefinir uma regra substitui a anterior: repetir semEnumTs.
const semEnumTs = { selector: 'TSEnumDeclaration', message: 'Use enums do Prisma ou "as const".' }

// 12 UI-17: cor só por token e durações 150/200/300 ms nas telas.
const paleta =
  /\b(?:bg|text|border|ring|fill|stroke|outline|from|to|via|divide|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b|-\[(?:#|oklch|rgb|hsl)/
const duracao = /\bduration-(?!(?:150|200|300)\b)\d+\b/
const msgPaleta =
  'Use tokens (bg-background, text-muted-foreground, bg-destructive/10…). Ver 12 §2.'
const msgDuracao = 'Durações permitidas: 150, 200 e 300 ms (12 §7).'
const semProcessEnv = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Leia variáveis por env() de src/server/env.ts (14 SEG-06).',
}
const semRelogio = [
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Injete "agora".' },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Injete "agora".',
  },
]
const regrasDeUi = [
  { selector: `Literal[value=/${paleta.source}/]`, message: msgPaleta },
  { selector: `TemplateElement[value.raw=/${paleta.source}/]`, message: msgPaleta },
  { selector: `Literal[value=/${duracao.source}/]`, message: msgDuracao },
  { selector: `TemplateElement[value.raw=/${duracao.source}/]`, message: msgDuracao },
]

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
    },
  },
  {
    // Código de cliente não acessa o servidor.
    files: ['src/components/**', 'src/lib/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/server/*', '@/features/*/servico'] },
            // enums são objetos `as const`, sem runtime do Prisma: podem ir ao cliente
            {
              regex: '^@/generated/(?!prisma/enums$)',
              message: 'O cliente só importa @/generated/prisma/enums.',
            },
          ],
        },
      ],
    },
  },
  {
    // 14 SEG-04/06: sem HTML cru, sem SQL montado por string, env só nos pontos de leitura.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'react/no-danger': 'error',
      'no-restricted-properties': [
        'error',
        { property: '$queryRawUnsafe', message: 'Use $queryRaw com template (SEG-04).' },
        { property: '$executeRawUnsafe', message: 'Use $executeRaw com template (SEG-04).' },
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/server/env.ts', 'src/server/db.ts', 'src/instrumentation.ts'],
    rules: {
      'no-restricted-syntax': ['error', semEnumTs, semProcessEnv],
    },
  },
  {
    // Domínio puro: relógio injetado (a lista inteira se repete porque o flat config substitui).
    files: ['src/domain/**'],
    rules: { 'no-restricted-syntax': ['error', semEnumTs, semProcessEnv, ...semRelogio] },
  },
  {
    // 13 DP-01: nada de consulta em laço. Sequência obrigatória por regra: disable com justificativa.
    files: ['src/features/**', 'src/server/**'],
    rules: { 'no-await-in-loop': 'error' },
  },
  {
    files: ['src/app/**/*.tsx', 'src/features/**/*.tsx', 'src/components/**/*.tsx'],
    ignores: ['src/components/ui/**'],
    rules: { 'no-restricted-syntax': ['error', semEnumTs, semProcessEnv, ...regrasDeUi] },
  },
  {
    // Código gerado pelo shadcn (12 UI-11): mantido como a CLI entrega, sem as regras estritas
    // de estilo de tipo que ele não segue. As regras de segurança continuam valendo.
    files: ['src/components/ui/**'],
    rules: {
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    // Gráficos do shadcn (M10): o <style> das cores vem só do ChartConfig do código (nada do
    // usuário) e os tipos de payload do recharts são `any`.
    files: ['src/components/ui/chart.tsx'],
    rules: {
      'react/no-danger': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // Arquivos de config em JS/MJS não passam pelo type-checker.
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
])
