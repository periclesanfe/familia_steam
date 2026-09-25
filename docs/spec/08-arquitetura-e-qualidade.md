# 08 — Arquitetura, stack e qualidade

## 1. Stack (versões conferidas em 24/09/2026)

| Camada      | Escolha                                                                            | Versão                                                                               | Observação                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime     | Node.js                                                                            | **24 LTS**                                                                           | Node 20 está em EOL; Vitest 5 exige ≥ 22.12                                                                                                                                 |
| Gerenciador | pnpm                                                                               | **≥ 11** (fixar em `packageManager`)                                                 | aprovar scripts de build em `pnpm-workspace.yaml` (`allowBuilds: { prisma: true, "@prisma/engines": true, esbuild: true, unrs-resolver: true }`); sem isso, `install` falha |
| Framework   | **Next.js (App Router)**                                                           | **16.3.x**; subir para **16.3.7** assim que sair (30/09/2026, correção crítica)      | Turbopack padrão; `proxy.ts` no lugar de `middleware.ts`; `params`/`cookies()` são async                                                                                    |
| UI runtime  | React                                                                              | 19.x (embutido no Next)                                                              | React Compiler desligado na v1                                                                                                                                              |
| Linguagem   | TypeScript                                                                         | **~5.9**                                                                             | **não usar TS 7.x**: o typescript-eslint 8.x declara peer `<6.1`                                                                                                            |
| Estilo      | Tailwind CSS                                                                       | 4.x                                                                                  | via `@tailwindcss/postcss`                                                                                                                                                  |
| Componentes | shadcn/ui (CLI v4, base Radix)                                                     | 4.x                                                                                  | componentes copiados para `src/components/ui`                                                                                                                               |
| Formulários | `<form action>` + `useActionState` + zod                                           | **4.x**                                                                              | sem biblioteca de formulário; zod valida no servidor (12 UI-13)                                                                                                             |
| Markdown    | react-markdown + remark-gfm                                                        | atuais                                                                               | sem `rehype-raw` (RN-ACE-15)                                                                                                                                                |
| Datas       | `Intl` (sem biblioteca)                                                            | —                                                                                    | `src/domain/tempo.ts`: fuso IANA via `Intl.DateTimeFormat`, com lacuna de horário de verão tratada e testada                                                                |
| Banco       | PostgreSQL                                                                         | 17                                                                                   | `docker compose` em dev                                                                                                                                                     |
| ORM         | **Prisma ORM**                                                                     | **7.10.0 exato** (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) + `dotenv` (dev) | ⚠ `pnpm add prisma` puxa a **8.0.0-rc**; fixe a versão                                                                                                                      |
| Testes      | Vitest / Playwright                                                                | 5.x / 1.63.x                                                                         | fixtures JSON para a Steam, sem MSW                                                                                                                                         |
| Lint        | ESLint 9.39.x + eslint-config-next 16 + typescript-eslint + eslint-config-prettier | —                                                                                    | o ESLint 10 quebra o eslint-plugin-react do config do Next (PR aberto); migrar depois                                                                                       |
| Formatação  | Prettier 3.x + prettier-plugin-tailwindcss 0.8.x                                   | —                                                                                    | o plugin exige `tailwindStylesheet`                                                                                                                                         |
| Git hooks   | husky + lint-staged                                                                | —                                                                                    | só no pre-commit                                                                                                                                                            |

## 2. Decisões de arquitetura (ADRs)

- **ADR-001 — Next.js full-stack, e não React + Nest separados.** São 5 usuários e um domínio pequeno, mas cheio de regras. Separar front e back dobraria deploy, CI, tipos, auth e CORS sem ganho. Server Components fazem a leitura e Server Actions fazem a mutação, com tipos de ponta a ponta. **Toda Server Action exportada é um endpoint POST público e passa pelo guard (RN-ACE-03).** Portabilidade: o domínio (`src/domain`) é TypeScript puro, e os serviços (`src/server`) viram um backend Nest sem reescrever regras se um dia surgir app mobile ou API pública.
- **ADR-002 — Estados temporais derivados e um job idempotente** (C-DERIVADO). Sem fila (pg-boss) e sem cron por tarefa. `GET /api/cron/tick`, chamado a cada 5 min, faz só o que exige efeito (§7). A correção não depende do cron: telas e mutações calculam pelo relógio.
- **ADR-003 — Login Steam feito à mão** (06 §2). O Auth.js v5 é beta e recusa OpenID 2.0; os plugins comunitários são frágeis. Sessão própria em tabela.
- **ADR-004 — Linguagem ubíqua em português.** Entidades, campos, funções de domínio e rotas usam os termos do Regulamento (`Rodada`, `Sobra`, `apurarSorteio`, `/votacoes`), sem acento. Termos técnicos ficam em inglês (`page.tsx`, `schema`, `props`). Isso reduz o erro de tradução nas regras, que são a parte difícil.
- **ADR-005 — Anexos em `bytea` no Postgres.** Menos de 200 MB por ano: um banco, um backup e nenhuma infra extra. _ponytail:_ migrar para S3/R2 se passar de ~1 GB.
- **ADR-006 — Sem papel de admin** (art. 3º). Os poderes coletivos são efeitos tipados de votação (RN-VOT-07/09).
- **ADR-007 — Sorteio com `crypto.randomInt` e snapshot com hash** (RN-SOR-08). O beacon drand é melhoria opcional.
- **ADR-008 — Sem notificações externas na v1.** Painel de pendências + textos para o GRUPO. Webhook do Discord ou Telegram depende da D-26.

## 3. Estrutura de pastas

```text
.
├─ docs/                      spec + regulamento (fora do Prettier: C-HASH)
├─ prisma/
│  ├─ schema.prisma           (05 §2)
│  └─ migrations/             0001_init + 0002_regras (05 §3)
├─ prisma.config.ts
├─ scripts/
│  ├─ cli.ts                  bootstrap | corrigir-bootstrap (RN-ACE-10)
│  └─ seed-dev.ts             (05 §5)
├─ src/
│  ├─ app/                    rotas (07 §1): só composição, sem regra de negócio
│  ├─ domain/                 REGRAS PURAS (sem I/O; só zod, Intl, node:crypto e @/generated/prisma/enums)
│  │  ├─ tempo.ts hash.ts dinheiro.ts quorum.ts financeiro.ts sorteio.ts
│  │  ├─ cessao.ts compra.ts ciclo.ts regulamento.ts efeitos.ts erros.ts
│  │  └─ *.test.ts            testes unitários ao lado
│  ├─ features/<feature>/     autenticacao | onboarding | rodadas | financeiro | votacoes
│  │  │                       | compra | cessao | ciclos | familia | steam | regulamento
│  │  │                       | auditoria | grupo | pendencias | anexos
│  │  ├─ acoes.ts             'use server': finas (auth → zod → serviço)
│  │  ├─ consultas.ts         'server-only': leituras para RSC (devolvem DTOs)
│  │  ├─ servico.ts           'server-only': transação, locks, domínio, auditoria
│  │  ├─ schemas.ts           zod compartilhado (form + action)
│  │  └─ componentes/         UI da feature
│  ├─ server/                 infraestrutura server-only
│  │  ├─ db.ts                PrismaClient singleton (adapter-pg)
│  │  ├─ acao.ts              acao(schema, handler), §4.1
│  │  ├─ tx.ts                emTransacao(fn), travar(tx, chave)
│  │  ├─ relogio.ts           agora(): Date (único ponto de leitura do relógio)
│  │  ├─ auditoria.ts         registrarEvento(tx, …) com mascaramento
│  │  ├─ auth/                openid.ts sessao.ts guards.ts perfil.ts
│  │  ├─ steam/               api.ts (fetch injetável) schemas.ts sync.ts loja.ts
│  │  ├─ anexos.ts            magic bytes, sha256, gravação
│  │  ├─ tick.ts              job (§7)
│  │  └─ env.ts               zod de process.env
│  ├─ components/             compartilhados (07 §6.2) + ui/ (shadcn)
│  ├─ lib/                    utilitários de cliente (cn, rotulos, formatadores)
│  └─ generated/prisma/       client gerado (gitignored); enums.ts usado pelo domínio
├─ tests/
│  ├─ integracao/             serviços contra Postgres real
│  ├─ e2e/                    Playwright
│  ├─ fixtures/steam/         respostas reais (appdetails, wishlist, owned games)
│  ├─ fabricas.ts
│  └─ vazio.ts                alias de 'server-only' nos testes
└─ …config (eslint, prettier, tsconfig, vitest, playwright, docker)
```

`prisma.config.ts` (o Prisma 7 **não** lê `.env` sozinho; o fallback vazio deixa o `prisma generate` rodar no postinstall e no build do Docker, sem banco):

```ts
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
})
```

`src/server/tx.ts`:

```ts
export const travar = (tx: Tx, chave: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`
// chaves: 'ata' | `rodada:${id}` | `votacao:${id}` (RN-GER-06)
```

### Regras de dependência (checadas por lint, §5.1)

```text
app  →  features  →  server  →  domain
 │         │           ↑           ↑
 └──→ components/lib   └── generated/prisma   (domain: só generated/prisma/enums)
components/lib  ✗→ server, features/*/servico, generated
```

## 4. Padrões de código

### 4.1 Server Action: fina e sempre igual

```ts
// src/features/financeiro/acoes.ts
'use server'
import { acao } from '@/server/acao'

import { registrarPagamentoSchema } from './schemas'
import { registrarPagamento } from './servico'

export const registrarPagamentoAcao = acao(registrarPagamentoSchema, (entrada, ctx) =>
  registrarPagamento(ctx, entrada),
)
```

`acao(schema, handler)` (em `src/server/acao.ts`):

1. resolve a sessão e o perfil (ou devolve `NAO_AUTENTICADO`);
2. valida com zod, com erros por campo;
3. chama o handler;
4. converte `ErroDeNegocio` em `{ ok: false, codigo, mensagem, artigo? }`;
5. faz `revalidatePath('/', 'layout')` depois de sucesso (13 DP-11);
6. marca a função com um `Symbol` verificado pelo teste de guarda (14 SEG-01).

A assinatura é a do `useActionState`, `(estadoAnterior, formData) => Promise<Estado>`, e `lerFormulario` converte o `FormData` antes do zod. O retorno é sempre `{ ok: true, dados } | { ok: false, erros?, codigo?, mensagem?, artigo?, valores }`: `valores` volta para o formulário não perder o que foi digitado (12 UI-13).

### 4.2 Serviço: transação, lock, domínio e auditoria

```ts
export async function registrarPagamento(ctx: Contexto, e: RegistrarPagamento) {
  return emTransacao(async (tx) => {
    const o = await tx.obrigacao.findUniqueOrThrow({
      where: { id: e.obrigacaoId },
      include: { pagamentos: true, rodada: { include: { cessoes: true } } },
    })
    exigir(podeRegistrarPagamento(ctx.perfil, o), 'SEM_PERMISSAO')              // guard de contexto
    exigir(e.valorCentavos <= saldo(o), 'VALOR_ACIMA_DO_SALDO', 'art. 11')        // regra pura
    const agora = ctx.agora                                                       // relógio do servidor
    const recebedorId = e.recebedorId ?? recebedorPadrao(o, o.rodada.cessoes, e.pixEm)
    const p = await tx.pagamento.create({ data: { /* pagador = o.devedorId (derivado) */ registradoEm: agora, … } })
    await registrarEvento(tx, ctx, 'pagamento.registrar', 'pagamento', p.id, { depois: p }) // mascara chavePix*
    return p
  })
}
```

- `ErroDeNegocio(codigo, mensagem, artigo?)`: os códigos ficam catalogados em `src/domain/erros.ts`.
- Toda mutação usa **uma** transação, o lock que a regra pedir (RN-GER-06) e o evento de auditoria nessa mesma transação.
- `consultas.ts` devolve **DTOs**: sem `Bytes`, com datas convertidas por `deDb` (C-DATA).

### 4.3 Domínio: puro e testável

- `agora: Date` é **injetado**. O lint proíbe `new Date()` sem argumento e `Date.now()` em `src/domain`. No servidor, `agora()` sai de `src/server/relogio.ts`.
- As saídas são valores ou uniões discriminadas (`{ tipo: 'CONTEMPLADA', … } | { tipo: 'SEM_CONTEMPLADO', motivo }`).
- O RNG é injetado em `escolher(elegiveis, rng)`, o que torna o teste determinístico.

### 4.4 Convenções gerais

- TypeScript `strict`, sem `any` e sem `enum` TS. O domínio importa enums só de `@/generated/prisma/enums` (objetos `as const`, sem runtime do Prisma). Usar `type` em vez de `interface`.
- Nomes: arquivos `kebab-case.ts`, componentes `PascalCase.tsx`, funções `camelCase` com verbo.
- Datas: sempre pelos helpers de `tempo.ts` e pelo componente `DataHora`. Campos `@db.Date` passam por `paraDb`/`deDb` (C-DATA).
- Dinheiro: sempre centavos (`Int`), exibidos com `Dinheiro`/`formatarBRL`.
- Comentários explicam o **porquê** e citam o artigo. Simplificações conscientes levam `// ponytail: <teto> — <upgrade>`.

## 5. Qualidade: configuração

### 5.1 ESLint (`eslint.config.mjs`)

```js
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'
import tseslint from 'typescript-eslint'

const semEnumTs = { selector: 'TSEnumDeclaration', message: 'Use enums do Prisma ou "as const".' }

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'src/generated/**',
    'coverage/**',
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
        },
      ],
      'no-restricted-syntax': ['error', semEnumTs],
    },
  },
  {
    // domínio puro (no flat config a regra é substituída, não mesclada: repetir semEnumTs)
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
    // cliente não acessa servidor
    files: ['src/components/**', 'src/lib/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@/server/*', '@/features/*/servico', '@/generated/*'] }] },
      ],
    },
  },
  prettier,
])
```

### 5.2 Prettier (`.prettierrc.json`)

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/app/globals.css",
  "tailwindFunctions": ["cn", "cva"]
}
```

`.prettierignore`: `src/generated`, `.next`, `pnpm-lock.yaml`, `prisma/migrations`, **`docs/regulamento`** (o hash do texto normativo não pode mudar). `.editorconfig`: utf-8, lf, 2 espaços.

### 5.3 TypeScript (`tsconfig.json`, além do template do Next)

`"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`, `"noFallthroughCasesInSwitch": true`, `"verbatimModuleSyntax": true`, `"paths": { "@/*": ["./src/*"] }`.

### 5.4 Scripts (`package.json`)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run --project unit",
    "test:watch": "vitest --project unit",
    "test:integracao": "vitest run --project integracao --no-file-parallelism",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed:dev": "tsx --conditions=react-server scripts/seed-dev.ts",
    "cli": "tsx --conditions=react-server scripts/cli.ts",
    "check": "pnpm lint && pnpm format:check && pnpm typecheck && pnpm test",
    "postinstall": "prisma generate",
    "prepare": "husky"
  }
}
```

Regras adicionais de ESLint entram no M1: UI (12 UI-17), `no-await-in-loop` (13 DP-01), `react/no-danger`, `$queryRawUnsafe` e `process.env` (14 SEG-04/06).

`--conditions=react-server` evita que o pacote `server-only` lance erro fora do Next. `lint-staged`: `*.{ts,tsx}` → `eslint --fix` + `prettier --write`; `*.{json,md,css,yml}` → `prettier --write` (fora `docs/regulamento`). Husky: `pre-commit` → `lint-staged`.

### 5.5 CI (GitHub Actions, `.github/workflows/ci.yml`)

Um job, com `services: postgres:17`:

1. checkout, pnpm e Node 24 (com cache);
2. `pnpm install --frozen-lockfile` (os `allowBuilds` já aprovados);
3. `pnpm lint`, `pnpm format:check` e `pnpm typecheck`;
4. `pnpm db:deploy` no banco de teste, depois `pnpm test` e `pnpm test:integracao`;
5. `pnpm build`, só para validar o build de produção;
6. `pnpm test:e2e`. O `webServer` do Playwright é **`pnpm dev` com `DEV_LOGIN=1`**, porque o build de produção desliga `/api/auth/dev` (RN-ACE-14).

A branch `main` é protegida: todo PR precisa do CI verde.

## 6. Testes

| Nível           | Ferramenta                                    | O quê                                                                                                                                                                                              | Meta                                                            |
| --------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Unitário**    | Vitest (projeto `unit`)                       | funções de `src/domain` + parsers puros de `src/server/steam` e `src/server/auth/openid.ts`; **todo cenário [U] do [09](09-cenarios-de-aceitacao.md)**                                             | 100% das regras com teste; cobertura de linhas do domínio ≥ 95% |
| **Integração**  | Vitest (projeto `integracao`) + Postgres real | serviços com transação, locks, constraints e triggers: sorteio concorrente, voto concorrente, numeração de ATA, efeitos de votação, cessão ponta a ponta, fechamento concorrente, tick idempotente | cenários [I]                                                    |
| **E2E**         | Playwright + login dev                        | onboarding e assinatura; sorteio → pagamento → confirmação; aviso → veto → nova escolha → compra → sobra; votação até a ATA                                                                        | cenários [E]                                                    |
| **Propriedade** | Vitest (`fast-check` opcional)                | conservação (RN-FIN-18) em sequências aleatórias de pagamentos, reembolsos e cessões                                                                                                               | 1 teste                                                         |

- **Relógio:** o domínio recebe `agora`. Na integração, `vi.setSystemTime` controla `agora()` (`src/server/relogio.ts`); nenhum SQL de negócio usa `now()`, e nunca se usa `sleep`.
- **Banco de teste:** banco próprio `consorcio_teste` (criado por `docker/initdb`). O `globalSetup` recria o schema e roda `prisma migrate deploy`, e recusa qualquer banco cujo nome não termine em `_teste`. Não usa `migrate reset`, que o Prisma bloqueia quando detecta um agente de IA. O `beforeEach` faz `TRUNCATE <tabelas> RESTART IDENTITY CASCADE` como `app_owner` (não dispara os triggers de linha). O código testado usa o `db` do app, como `app_rw`, e por isso os testes exercitam os privilégios reais (14 SEG-08). Os arquivos rodam em série. Os dados vêm das fábricas de `tests/fabricas.ts`.
- **`server-only`:** no projeto `integracao`, `resolve.alias: { 'server-only': './tests/vazio.ts' }`.
- **Steam:** `fetch` injetado em `server/steam/api.ts` + fixtures JSON reais em `tests/fixtures/steam/` (appdetails de Cyberpunk, Stardew e CS2; wishlist com `priority` 0 repetido; owned games privado; packagedetails).
- **E2E com tempo:** os instantes são preparados pela fábrica (rodada com `agendadaPara` no passado + chamada a `/api/cron/tick` com `CRON_SECRET`; as 48 h são simuladas recuando `avisadoEm`/`janelaVetoAte` no banco).

## 7. Job `tick` (`GET /api/cron/tick`)

- **Proteção:** `Authorization: Bearer <CRON_SECRET>`, comparado com `crypto.timingSafeEqual`.
- **Lease** (em vez de advisory lock de sessão, que falha com pool): `UPDATE controle SET ate = $agora + interval '2 minutes' WHERE chave = 'tick' AND (ate IS NULL OR ate < $agora) RETURNING 1`. Se não voltar linha, o tick sai; ao terminar, grava `ate = null` e `Controle('ultimo_tick')`.
- Cada passo é uma transação curta e **trava o próprio objeto** (RN-GER-06). Uma falha num passo não impede os outros. A resposta traz o resumo. `maxDuration` de 60 s, abaixo do intervalo de 5 min.

Passos, em ordem:

1. **Votações vencidas:** `ABERTA ∧ encerraEm ≤ agora` → REJEITADA (PRAZO) + ATA (RN-VOT-04/06).
2. **Sorteios:** recalcular `agendadaPara` das `AGENDADA` pela versão vigente no dia, exceto substitutas de anulação (RN-SOR-01). Depois, as rodadas `AGENDADA` com `agendadaPara ≤ agora`, em ordem (ciclo, sequência), vão para `executarRodada(SISTEMA)` (RN-SOR-02..10). Isso inclui a abertura do ciclo (RN-CIC-02/03/06/07), a ativação e a caducidade de admissões (RN-CAD-12).
3. **Fechamentos**, em ordem `(ciclo.numero, sequencia)`, sob `travar('fechamento')`: rodadas `CONTEMPLADA` sem cessão em andamento, com prazo vencido e aquisição registrada, ou com `fechamentoSolicitado` → `fecharRodada` (RN-FIN-13), que cria a SOBRA ou o rateio e tenta fechar a próxima.
4. **Rede de segurança:** SOBRAs pendentes, principais e complementares, e rateios que não nasceram no fechamento nem na contemplação (RN-FIN-14/16/17), criados de forma idempotente pelas constraints.
5. **Steam:** perfis vencidos (RN-STM-04), até 20 `SteamApp` (RN-STM-10) e verificação pós-compra (RN-COM-11).
6. **Limpeza:** `NonceOpenId` com mais de 1 dia e sessões expiradas.

Agendamento a cada 5 min (D-29):

- **VPS/Docker:** serviço `cron` (alpine) com `*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/tick`.
- **PaaS:** o cron do provedor, desde que aceite `*/5`. O Vercel Hobby só roda 1x/dia e não serve; o Pro serve.

## 8. Ambiente e deploy

### 8.1 Variáveis (`src/server/env.ts`, validadas por zod no boot)

| Variável               | Uso                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Postgres do app, papel `app_rw` (14 SEG-08)                                                     |
| `MIGRATE_DATABASE_URL` | Postgres das migrações (CLI), papel `app_owner`                                                 |
| `DEBUG_SQL`            | `1` imprime cada consulta com a duração (13 DP-16)                                              |
| `APP_URL`              | URL pública (`realm` e `return_to` do OpenID, links do GRUPO)                                   |
| `STEAM_API_KEY`        | GetPlayerSummaries, GetOwnedGames, ResolveVanityURL                                             |
| `CRON_SECRET`          | proteção do tick (**≥ 32 caracteres**)                                                          |
| `DEV_LOGIN`            | `1` habilita `/api/auth/dev` fora de produção. **Com `NODE_ENV=production`, o boot é recusado** |
| `TZ`                   | `UTC` no container (o fuso de negócio é aplicado no código)                                     |

### 8.2 Execução

- **Dev:** `docker compose up -d db` (Postgres na porta **5433** do host) → `pnpm i` → `pnpm db:migrate` → `pnpm db:seed:dev` → `pnpm dev` (app na porta **3100**, com `DEV_LOGIN=1`). As portas fogem das padrões para não colidir com outros projetos locais (ajustáveis por `DB_PORTA`/`APP_PORTA`).
- **Produção (padrão, D-29):** `docker-compose.prod.yml` com:
  - `db`: postgres:17 com volume e healthcheck;
  - `migrate`: alvo `migrate` do Dockerfile (node_modules completos), executando **a CLI do Prisma direto** (`./node_modules/.bin/prisma migrate deploy`), sem pnpm em runtime (o pnpm 11 revalida dependências antes de scripts e o corepack baixaria o pnpm); `depends_on: { db: { condition: service_healthy } }`;
  - `app`: alvo `runner`: **`alpine:3.24` + só o binário do Node** copiado de `node:24-alpine3.24` (mesma musl), sem npm/yarn/corepack, `tini` como PID 1, usuário `node` (uid 1000), `HEALTHCHECK` em `/api/saude` e Next `output: 'standalone'`. O `sharp` fica fora (`ignoredOptionalDependencies`, com `images.unoptimized`). Medido em 25/09/2026: **160 MB em disco / 56 MB comprimida**, cerca de 150 MB de RAM em repouso e parada limpa em menos de 1 s. `depends_on: { migrate: { condition: service_completed_successfully } }`;
  - `cron`: curl a cada 5 min;
  - `backup`: `pg_dump` diário, retenção de 30 dias, cópia para fora do servidor;
  - HTTPS via Caddy (proxy reverso, que grava `X-Forwarded-For`).
- **Bootstrap** (uma vez, com o texto final da 1.0): `docker compose run --rm -v ./bootstrap.json:/bootstrap.json:ro migrate node node_modules/tsx/dist/cli.mjs --conditions=react-server scripts/cli.ts bootstrap /bootstrap.json` (o alvo `migrate` passa a levar `scripts/` no M2) (RN-ACE-10). Depois, divulgar no GRUPO o hash impresso.

### 8.3 Observabilidade (mínima)

- Logs em JSON (wrapper `log.info/erro`), sem PII e sem URLs com `key=`.
- `GET /api/saude` → `{ ok, db, ultimoTick }` (`ultimoTick` = `Controle('ultimo_tick').atualizadoEm`), para um monitor externo, com alerta se o tick passar de 30 min sem rodar.
- _ponytail:_ sem Sentry nem APM; adicionar se surgirem erros não reproduzíveis.

## 9. Segurança (checklist)

Modelo de ameaças, decisões e mapa OWASP: [14](14-seguranca.md). Performance e N+1: [13](13-performance-e-dados.md).

- [ ] OpenID validado por inteiro (RN-STM-01): mapa único, `signed`, POST para a constante, `state`, anti-replay.
- [ ] Cookie de sessão `HttpOnly; Secure; SameSite=Lax`, validade fixa de 30 dias, token com hash no banco; sessões revogadas em `REVINCULAR_STEAM` e em `corrigir-bootstrap`.
- [ ] Guard em **toda** action e consulta (RN-ACE-03), com teste de autorização por perfil em cada action.
- [ ] Upload: `mime` pelos magic bytes, 5 MB, sem SVG ou HTML; vínculo só de anexo próprio e não vinculado; download com `nosniff`, `no-store` e `filename` gerado (RN-ACE-09).
- [ ] CSP com nonce em `proxy.ts` e headers estáticos em `next.config.ts` (RN-ACE-15); sem `images.remotePatterns` (14 SEG-05).
- [ ] Markdown sem HTML cru; links só `https`.
- [ ] Segredos só no servidor; `server-only` nos módulos sensíveis; Bearer do tick com `timingSafeEqual`.
- [ ] Sem PII em logs; `chavePix*` mascarada na auditoria e nos snapshots.
- [ ] `/api/auth/dev` devolve 404 em produção (teste) e o boot recusa `DEV_LOGIN=1` em produção.
- [ ] Rate limit de login em memória por IP (`X-Forwarded-For` do Caddy). _ponytail:_ passar para o Postgres se houver mais de uma instância.
