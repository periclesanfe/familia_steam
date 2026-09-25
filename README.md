# Família Steam: controle do consórcio

Sistema web para o **Consórcio da Família Steam**: compra coletiva e rotativa de jogos entre 5 amigos de uma mesma Família Steam. Ele substitui a planilha compartilhada do Regulamento e cobre sorteio mensal, contribuições via Pix, prêmio e sobra, aviso prévio e veto de jogos, votações com ATA, Lista de Jogos Bloqueados e integração com a Steam (login, bibliotecas e listas de desejos).

> **Status:** especificação concluída (`docs/spec`), implementação em andamento. Validação local primeiro, hospedagem depois.

## Documentação

- [Regulamento v1.0 (minuta)](docs/regulamento/regulamento-v1.0.md): a fonte normativa.
- [Spec](docs/spec/README.md): regras de negócio, decisões de interpretação, acessos, modelo de dados, integração Steam, telas, arquitetura, cenários de aceitação e plano de implementação.
- [Decisões pendentes dos membros](docs/spec/03-decisoes-de-interpretacao.md#2-as-decisões-que-os-membros-precisam-tomar-resumo)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma ORM 7 · PostgreSQL 17 · Vitest · Playwright · ESLint + Prettier.

## Desenvolvimento

Instruções de setup entram com o marco M0 ([plano](docs/spec/10-plano-de-implementacao.md)).
