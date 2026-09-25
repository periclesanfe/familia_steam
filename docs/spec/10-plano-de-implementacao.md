# 10 — Plano de implementação

Cada marco termina com o sistema **implantável** e o CI verde. A ordem segue as dependências: identidade → Steam → sorteio → dinheiro → votação → compra → processos de exceção.

> **Prazo real.** Hoje é 24/09/2026. Para o 1º ciclo começar em **03/10/2026** com o sistema, M0 a M8a teriam de ficar prontos em 9 dias, o que não é realista. As opções são:
>
> - (a) começar o 1º ciclo em **03/11/2026** (pela D-02, basta assinar depois de 02/10); **ou**
> - (b) rodar outubro na planilha e migrar em novembro. Isso exige um script de importação, que não está no plano (YAGNI até a decisão).

## Marcos

### M0 — Fundação

- `create-next-app@16.3` (TS, App Router, `src/`, Tailwind 4, ESLint), pnpm (`allowBuilds`) e Node 24 fixados.
- `shadcn init -t next` (base Radix) e os componentes base.
- ESLint (08 §5.1), Prettier + plugin Tailwind, tsconfig estrito, `.editorconfig`, husky + lint-staged.
- Prisma **7.10.0 exato**, `prisma.config.ts` (dotenv), `src/server/db.ts` (adapter-pg), `docker-compose.yml` (db).
- Vitest (projetos `unit` e `integracao`, alias de `server-only`), Playwright (`webServer: pnpm dev`).
- `src/server/env.ts` e CI (08 §5.5).
- **Pronto quando:** `pnpm check && pnpm build` estão verdes no CI e há uma página "olá" no preview.

### M1 — Núcleo de dados e domínio base

- `schema.prisma` (05 §2) + `0002_regras.sql` (05 §3).
- `src/domain`: `tempo`, `hash`, `dinheiro`, `regulamento` (parâmetros, vigência, `adesaoValida`), `quorum`, `erros`.
- `src/server`: `relogio.ts`, `tx.ts` (`travar`), `auditoria.ts` (mascaramento), `acao.ts`, `anexos.ts`.
- Tokens e `globals.css` (12 UI-02..05), regras de ESLint de UI, dados e segurança (12 UI-17, 13 DP-01, 14 SEG-04/06) e o script de contraste.
- `db.ts` com timeouts e `omit` de bytes (13 DP-04/09), `contarConsultas` e `DEBUG_SQL` (DP-16).
- Papéis `app_owner`/`app_rw`, migração de privilégios e `MIGRATE_DATABASE_URL` (14 SEG-08); `remotePatterns` fora, COOP, `pnpm audit` e Dependabot (SEG-05/10).
- **Pronto quando:** CA 01–04, 82, 83, 87 (trigger), 106, 146–149, 169 e 171 passam.

### M2 — Identidade, bootstrap e Regulamento

- OpenID Steam (RN-STM-01..03), sessão (RN-ACE-05), guards, `perfilDe` e login dev.
- CLI `bootstrap` / `corrigir-bootstrap` (RN-ACE-10) + seed dev.
- `/entrar`, `/boas-vindas` (onboarding, adesão, Anexo I), `/regulamento`, `/perfil` (dados, Pix, sessões).
- Vigência da 1.0 → ciclo 1 `PLANEJADO` + rodada 1 `AGENDADA` (RN-REG-01, RN-CIC-01).
- Shell (`Sidebar`, `CabecalhoPagina`, `AbasNaUrl`), `Dinheiro`, `DataHora`, `Prazo` e padrão de formulário (12 UI-09..15); cookies com prefixo e CSP no `proxy.ts` (14 SEG-02/05).
- **Pronto quando:** CA 88, 90, 95, 98–100, 102–104, 112, 118, 125, 170, 175 (página) e 176 passam.

### M3 — Integração Steam

- `server/steam` (api com fetch injetável, schemas, sync, loja), passos Steam do tick, cache `SteamApp`, pausa em `Controle`.
- `/membros`, `/membros/[id]`, `/jogos/[appId]`, `/familia` (biblioteca, vagas), `/lista-de-desejos`.
- **Pronto quando:** CA 107–111, 173, 174 e 177 passam com fixtures reais e o guia de privacidade é exibido.

### M4 — Ciclo e sorteio

- Abertura do ciclo (RN-CIC-02/03), participantes previstos, declarações (não concorrer, justificativa antecipada), derivadas de atraso, em dia e postergação.
- `apurarSorteio`/`escolher`, `executarRodada`, tick com lease (sorteio devido), rodada seguinte, rodada sem contemplado.
- `/rodadas`, `/rodadas/[id]?aba=sorteio`, evidências e textos para o GRUPO (sorteio).
- **Pronto quando:** CA 05–18, 20–24, 116 e 150 passam.

### M5 — Financeiro

- Contribuições (RN-FIN-02, `pagantesNoCorte`), pagamentos (registro com `recebedorId`, confirmação, contestação, cancelamento pelo devedor), justificativa como `Declaracao`, upload e download de anexos (RN-ACE-09).
- Aba Pagamentos, `/financeiro`, extratos, grade do ciclo, exportação e pendências financeiras do painel.
- **Pronto quando:** CA 19 (o contestado conta), 25, 33–36, 38, 96, 121, 123, 133, 172, 175 (download) e 178 passam.

### M6 — Votações, ATAs e Anexo I

- Motor de votação (RN-VOT-01..07, 13), `chaveObjeto`, catálogo de efeitos (RN-VOT-08/09), ATA (`markdown` + `sha256`), tick de votações vencidas.
- `/votacoes`, `/votacoes/nova` (formulário por efeito), `/votacoes/[id]`, `/atas`, `/atas/[numero]`, `/bloqueados`, componente `Markdown` seguro.
- **Pronto quando:** CA 19 (`INVALIDAR_PAGAMENTO`), 72–81, 84–86, 87 (conteúdo e sha256), 89 e 124 passam.

### M7 — Jogo do mês

- Aviso (RN-COM-03, PACOTE), `validarProduto` V1–V12, status derivado, veto, 16 IV, compra (irregularidades), verificação de biblioteca, reembolso, `fecharRodada` com cadeia, SOBRA (RN-FIN-13/14/16).
- Aba Jogo e textos do aviso e da compra.
- **Pronto quando:** CA 26–32, 54–71, 105, 114, 120, 127–129, 131, 132, 137, 138, 160 e 163–166 passam.

### M8a — Exceções que podem ocorrer já no 1º mês

- Cessão (RN-CES), saída do consórcio e da família (RN-SAI-01..05, RN-CAD-10/11), impossibilidade e art. 30 (RN-SAI-06), `RECONHECER_*`, `REVINCULAR_STEAM`.
- **Pronto quando:** CA 39–41, 43–45, 47–53, 101, 119, 122, 126, 130, 134–136, 142, 153–155, 157–159 e 167 passam.

### M8b — Fim de ciclo e processos raros

- Janela de revisão e confirmações (RN-CIC-04..07), rateio (RN-FIN-17), encerramento (RN-CIC-10), admissão e convites/remoções (RN-CAD-08/09/12/13), anulação (RN-SOR-13), alteração do Regulamento com diff e parâmetros, transcrição de atos (RN-GER-05).
- **Pronto quando:** CA 37, 42, 46, 91–95, 97, 115, 117, 139–141, 143–145, 151, 152, 156, 161, 162 e 168 passam.

### M9 — Acabamento e produção

- Painel de pendências completo (07 §4), revisão de acessibilidade (07 §7), `/auditoria`, `/api/saude`.
- `docker-compose.prod.yml` (db, migrate, app, cron, backup), Caddy com HTTPS e monitor externo.
- **Texto final da 1.0**, com as redações do 03 §3 escolhidas (no mínimo D-01, D-06 e D-15), depois bootstrap real dos 5 fundadores e o hash no GRUPO. A ATA de caso omisso para as omissões restantes e os operadores (D-29) é votada **antes do 1º sorteio**.
- **Pronto quando:** CA 113 passa no CI; em produção, o login Steam real passa no smoke test e a restauração do backup foi testada.

### M10 — Famílias, acesso aberto e informação de jogos ([15](15-familias-e-acesso-aberto.md))

- **M10a:** login aberto (`VISITANTE`), área pessoal (jogos, lista de desejos, amigos), criar família, indicação com aprovação, convite por link, sair; `familiaId` e isolamento em todo o consórcio; vigência por assinatura de todos.
- **M10b:** dados ricos de jogos (imagens, gêneros, avaliações, jogadores agora), histórico de preço próprio, lista de desejos e biblioteca visuais.
- **M10c:** calendário de promoções e "em promoção agora" nas listas da família.
- **Pronto quando:** CA 180–192 passam, e os CAs anteriores continuam passando dentro de uma família.

## Caminho mínimo para operar o 1º mês

M0 → M1 → M2 → M4 → M5 → M6 → M7 → **M8a**, tudo antes do 1º sorteio. Cessão, saídas e impossibilidade podem acontecer já depois do primeiro sorteio.

O M3 (Steam) pode correr em paralelo depois do M2. Sem ele, V6, V9 e V10 caem em `DESCONHECIDO` e pedem declaração.

O **M8b** precisa estar pronto antes do fim do ciclo 1 (janela de revisão e admissão). Anulação e alteração do Regulamento podem ser necessárias antes disso, mas não bloqueiam o primeiro mês.

## Definição de pronto (vale para toda tarefa)

- [ ] A regra implementada cita a RN e o artigo no código, em comentário curto, e tem teste do CA correspondente.
- [ ] A action ou consulta tem guard de autorização e teste de acesso negado.
- [ ] O evento de auditoria é gravado na mesma transação.
- [ ] `pnpm check` verde; nenhum `eslint-disable` sem justificativa.
- [ ] Textos em pt-BR, com estados de carregamento, vazio e erro (12 §6, UI-18).
- [ ] Consulta nova de página com teste de constância (13 DP-16); nenhum `await` de banco em laço.
- [ ] Se a tarefa mudou uma regra ou decisão, a spec (02/03/09/11) foi atualizada no mesmo PR.
