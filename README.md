# Família Steam: controle do consórcio

Sistema web para o **Consórcio da Família Steam**: compra coletiva e rotativa de jogos entre 5 amigos de uma mesma Família Steam. Ele substitui a planilha compartilhada do Regulamento e cobre sorteio mensal, contribuições via Pix, prêmio e sobra, aviso prévio e veto de jogos, votações com ATA, Lista de Jogos Bloqueados e integração com a Steam (login, bibliotecas e listas de desejos).

> **Status:** especificação concluída (`docs/spec`); implementação em andamento (marco M0: fundação). Validação local primeiro, hospedagem depois.

## Documentação

- [Regulamento v1.0 (minuta)](docs/regulamento/regulamento-v1.0.md): fonte normativa.
- [Spec](docs/spec/README.md): regras, decisões, acessos, dados, Steam, telas, arquitetura, cenários e plano.
- [Decisões pendentes dos membros](docs/spec/03-decisoes-de-interpretacao.md#2-as-decisões-que-os-membros-precisam-tomar-resumo)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui (Radix) · Prisma ORM 7 · PostgreSQL 17 · Vitest · Playwright · ESLint + Prettier · Docker.

## Desenvolvimento local

Requisitos: Node ≥ 22.12 (o `.nvmrc` indica 24), pnpm 11 (`corepack enable`) e Docker.

```bash
cp .env.example .env          # ajuste se precisar
docker compose up -d db       # Postgres 17 em localhost:5433, com os papéis app_owner/app_rw
pnpm install                  # também gera o client do Prisma
pnpm db:migrate               # aplica as migrações
pnpm dev                      # http://localhost:3100
```

| Comando                                                | O que faz                                              |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `pnpm check`                                           | lint + formatação + tipos + testes unitários           |
| `pnpm test` / `pnpm test:integracao` / `pnpm test:e2e` | unitários / integração (Postgres) / E2E (Playwright)   |
| `pnpm format` / `pnpm lint:fix`                        | corrige formatação e lint                              |
| `pnpm db:migrate` / `pnpm db:deploy`                   | cria e aplica migração (dev) / aplica migrações (prod) |

## Docker

```bash
docker compose --profile app up --build    # db + migrate + app em http://localhost:3100
docker build --target runner -t familia-steam .
```

A imagem do app é Alpine com só o binário do Node, o `tini` e o build standalone do Next, rodando sem root (cerca de 160 MB em disco, 56 MB comprimida). Detalhes em [docs/spec/08 §8](docs/spec/08-arquitetura-e-qualidade.md#8-ambiente-e-deploy).

O app roda como `app_rw`, que não é dono das tabelas, e as migrações como `app_owner` ([14 SEG-08](docs/spec/14-seguranca.md)). Os papéis são criados por `docker/initdb` no primeiro boot do volume. Um volume antigo, anterior ao M1, precisa ser recriado com `docker compose down -v && docker compose up -d db && pnpm db:deploy`. Os testes de integração usam um banco próprio, `consorcio_teste`.

As portas locais (3100 para o app, 5433 para o banco) evitam colisão com outros projetos e podem ser trocadas por `APP_PORTA` e `DB_PORTA`.
