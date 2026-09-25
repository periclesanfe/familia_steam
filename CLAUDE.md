# CLAUDE.md

@AGENTS.md

Controle do Consórcio da Família Steam. A spec em `docs/spec/` é a fonte da verdade; o Regulamento está em `docs/regulamento/`.

## Como trabalhar aqui

- Idioma: pt-BR na conversa, na UI, nos commits e nos PRs.
- Siga os marcos de `docs/spec/10-plano-de-implementacao.md`. Um marco (ou parte dele) = uma branch `mN-descricao` + PR para `main`. Não commitar direto na `main`.
- Toda regra implementada cita o ID (`RN-XXX-nn`) e o artigo num comentário curto, e tem o teste do cenário `CA-nn` (doc 09).
- Mudou uma regra ou decisão? Atualize a spec (02/03/09/11) no mesmo PR.
- Commits no formato `tipo(escopo): descrição` (feat, fix, docs, chore, test, refactor).

## Invariantes que não se negociam

- Não existe papel de administrador (art. 3º). Todo poder coletivo é efeito de votação aprovada (RN-VOT-07/09). Única exceção: antes da vigência de uma família, quem a criou organiza as entradas e exclusões (RN-FAM-10, D-37); o papel acaba quando todos assinam.
- O domínio (`src/domain`) é puro: sem I/O, com `agora` injetado e sem `new Date()`.
- Dinheiro em centavos (`Int`). Datas de negócio no fuso `America/Sao_Paulo`, com `DataCivil` para campos `@db.Date`.
- Toda mutação: uma transação, o lock da regra e `EventoAuditoria` na mesma transação.
- Prisma fixado em **7.10.0** exato (a tag `latest` da CLI é a 8.0 RC). Proibido `db push`: só migrações.
- Não editar `docs/regulamento/` com formatador (o hash do texto entra no sistema).
- UI: cor só por token, durações 150/200/300 ms, formulários com `useActionState` sem biblioteca (doc 12).
- Dados: nada de `await` de banco em laço; componente filho não consulta; nada de `fetch` dentro de transação (doc 13).
- Segurança: toda action por `acao()` com guard sobre o estado do banco; valores calculados nunca vêm do formulário (doc 14).

## Comandos

`pnpm check` (lint + formatação + tipos + unitários), `pnpm test:integracao`, `pnpm test:e2e`, `pnpm db:migrate`. Banco local: `docker compose up -d db` (porta 5433); app em `pnpm dev` (porta 3100).
