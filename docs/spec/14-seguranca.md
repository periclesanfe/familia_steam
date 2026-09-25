# 14 — Segurança: ameaças e decisões

Este documento consolida o modelo de ameaças e as decisões de segurança (`SEG-nn`). As regras normativas de acesso continuam em [04](04-acessos-e-perfis.md) (RN-ACE) e as do login em [06 §2](06-integracao-steam.md#2-login-com-steam-openid-20) (RN-STM-01). Aqui fica o **porquê**, o que faltava e a verificação.

Referências: OWASP Top 10:2025, OWASP ASVS 5.0 (V2, V3, V6, V7, V8, V13 e V16), a documentação de Data Security e Authentication do Next 16.3 e os advisories do Next de 2025–2026. Tudo conferido em 25/09/2026.

## 1. O que proteger

| Ativo                                                                                  | Por que importa                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Integridade dos registros** (obrigações, pagamentos, sorteios, votos, ATAs, Anexo I) | é o "livro-caixa" do grupo; uma adulteração gera prejuízo e briga (arts. 39/40) |
| Chaves Pix e comprovantes                                                              | dado pessoal: CPF, telefone ou e-mail, e imagem de extrato bancário             |
| Sessões                                                                                | quem tem a sessão vota, declara e registra pagamento em nome do membro          |
| `STEAM_API_KEY`, `CRON_SECRET`, credenciais do banco                                   | abuso da conta Steam do operador; disparo do job; acesso total aos dados        |
| Disponibilidade no dia do sorteio e no fim de prazo                                    | prazos do Regulamento correm pelo relógio (C-DERIVADO)                          |

## 2. Quem ameaça

1. **Anônimo da internet.** A superfície pública é só `/entrar`, o fluxo OpenID, `/api/saude` e `/api/cron/tick` (Bearer). Sem conta na lista de SteamIDs, ninguém passa do login (RN-ACE-04).
2. **Um membro agindo de má-fé (o cenário mais realista).** Tem sessão válida e conhece o sistema. Pode tentar:
   - registrar pagamento em obrigação alheia (IDOR);
   - votar duas vezes ou em nome de outro;
   - alterar o próprio valor devido;
   - sortear de novo até dar o resultado que quer;
   - apagar rastros.
3. **Operador do servidor.** Tem acesso ao banco. Por acordo, não altera dados (RN-ACE-11); as defesas são técnicas e sociais (SEG-09).
4. **Dependência comprometida** (supply chain, A03:2025).
5. **Dado hostil vindo da Steam:** nome de jogo, descrição com HTML, URL de imagem.
6. **Sessão roubada** (dispositivo perdido, XSS).

## 3. Decisões

### SEG-01 — Autorização dentro de cada action e de cada consulta

Toda Server Action exportada é um **endpoint POST público**. Ela pode ser chamada direto, sem a UI, mesmo que nenhum botão a use. Checar na página, esconder o botão ou proteger no layout **não protege a action**.

- Actions só existem por meio de `acao(schema, handler)` ([08 §4.1](08-arquitetura-e-qualidade.md#41-server-action-fina-e-sempre-igual)), que resolve sessão e perfil antes de tudo. **Teste de guarda:** um teste de integração importa todos os `src/features/*/acoes.ts` e falha se alguma exportação não carregar a marca (`Symbol`) que `acao()` põe na função.
- **Contra IDOR:** a action recebe só o identificador e a intenção. O serviço relê o registro **dentro da transação** e decide com o guard sobre o estado do banco (`exigirDevedor(obrigacaoId)`, `exigirRecebedor(pagamentoId)`…). Validar o formato com zod não é autorização.
- **Valores calculados nunca vêm do formulário:** contribuição, prêmio, SOBRA, rateio, quórum, `n` de eleitores, quem é o recebedor padrão e o instante do registro (`agora()` do servidor). Do formulário só vêm **fatos declarados** (valor pago, `pixEm`, texto), validados contra o estado (ex.: valor ≤ saldo).
- **O ator é sempre a sessão.** Nenhum schema aceita `pessoaId` do ator, `atorId` ou `registradoPorId`. A transcrição de atos do GRUPO (RN-GER-05) é a única forma de agir "em nome de", e fica registrada como tal.
- Consultas de página chamam o guard do perfil antes de ler (RN-ACE-03). O proxy **não** faz autorização (SEG-05).

### SEG-02 — Sessão

Complementa a RN-ACE-05:

- Nome do cookie: `__Host-sessao` quando `APP_URL` é `https:` (produção); `sessao` em `http://localhost`. O prefixo `__Host-` exige `Secure`, `Path=/` e nenhum `Domain`, e impede que um subdomínio vizinho injete o cookie. Como os navegadores divergem sobre prefixos em `http://localhost`, a escolha sai do esquema da `APP_URL`, não do `NODE_ENV`.
- Atributos: `HttpOnly`, `Secure` (com https), `SameSite=Lax`, `Path=/`, `Max-Age` = 30 dias. **`Lax`, não `Strict`:** o retorno da Steam é uma navegação vinda de outro site, e com `Strict` o usuário parece deslogado logo depois do login.
- Token de 32 bytes (`randomBytes(32).toString('base64url')`); o banco guarda só o `sha256`. Logout é Server Action (POST), que apaga a linha e o cookie. Revogação em massa: RN-ACE-16 e RN-ACE-10.
- Cookie do OpenID: `__Secure-steam_state` com `Path=/api/auth/steam` (o `__Secure-` permite restringir o caminho; o `__Host-` não). Os demais atributos continuam os de [06 §2](06-integracao-steam.md#2-login-com-steam-openid-20).
- O `env.ts` recusa o boot em produção se `APP_URL` não for `https:`, salvo `localhost` (o Docker local, 08 §8.2).

### SEG-03 — CSRF

- Server Actions: o Next compara `Origin` com `Host`/`X-Forwarded-Host` e recusa se diferirem. Uma requisição **sem** `Origin` passa com um aviso no log, mas aí o `SameSite=Lax` impede o envio do cookie num POST vindo de outro site, e o guard recusa por falta de sessão. **As duas camadas são necessárias.**
- Nenhuma mutação por GET. As exceções são o callback OpenID (protegido pelo `state`), o login dev (só fora de produção) e o tick (Bearer).
- `serverActions.allowedOrigins` **não** é configurado: o Caddy repassa `X-Forwarded-Host`, e a comparação funciona sem lista.

### SEG-04 — Saída segura (XSS e injeções)

- O React escapa tudo. `dangerouslySetInnerHTML` é proibido (ESLint `react/no-danger: error`). O Markdown segue a RN-ACE-15 (sem HTML cru, links só `https:`).
- **HTML vindo da Steam nunca é renderizado.** O `appdetails` devolve HTML em `detailed_description`, `about_the_game` e às vezes em `short_description`. Esses campos **não são gravados**: o schema zod de 06 §8 só lê o que o sistema usa (nome, tipo, preço, categorias, descritores e URL da capa).
- URLs de imagem da Steam são validadas antes de gravar: `https:` + host terminando em `.steamstatic.com`. As outras viram `null` (fallback visual). A CSP (SEG-05) é a segunda barreira.
- **Nunca buscar uma URL que veio do usuário.** "Adicionar à lista de desejos por link" extrai o `appId` com regex (`/store\.steampowered\.com\/app\/(\d+)/`) e chama a API pela constante. O link colado jamais vira `fetch`. O mesmo vale para `linkExterno` de anexo: é gravado e exibido, nunca acessado pelo servidor.
- **Injeção de fórmula na exportação CSV** (RN-ACE-12): célula que começa com `=`, `+`, `-`, `@`, tab ou CR recebe `'` na frente. Nomes, justificativas e proposições são texto livre e seriam executados como fórmula no Excel ou Sheets de quem abrir o arquivo.
- SQL: só Prisma e `$queryRaw`/`$executeRaw` com _tagged template_ (parametrizado). `$queryRawUnsafe` é proibido pelo ESLint (`no-restricted-properties`).

### SEG-05 — CSP e headers

- A CSP com nonce por requisição fica no `proxy.ts`, como na RN-ACE-15. O proxy **só** monta a CSP: não autentica e não redireciona (CVE-2025-29927 e GHSA-6gpp-xcg3-4w24 mostraram que proteção só no proxy é contornável). O `matcher` ignora `_next/static`, `favicon`, `icon.svg` e prefetch.
- `style-src 'self' 'unsafe-inline'`: o Radix e o sonner renderizam `style` inline no SSR. _ponytail:_ estilo afrouxado; endurecer com `style-src-elem` com nonce + `style-src-attr 'unsafe-inline'` se valer o esforço.
- A CSP com nonce exige renderização dinâmica, o que o app já é (DP-10). O custo é zero.
- `images.remotePatterns` **sai** do `next.config.ts`. Com `images.unoptimized: true`, ele não tem efeito, e sem padrão o otimizador recusa qualquer host remoto. A superfície de SSRF/DoS do `/_next/image` fica fechada.
- **Downloads** (`/api/anexos/[id]`): além dos headers da RN-ACE-09, `Content-Security-Policy: sandbox`. Se um arquivo poliglota passar pela checagem de _magic bytes_, ele não executa script na origem do app.
- Headers estáticos: os do `next.config.ts` (já implementados), mais `Cross-Origin-Opener-Policy: same-origin`. O `Permissions-Policy` fica de fora: o app não usa nenhuma API sensível do navegador.

### SEG-06 — Dados no cliente e segredos

- `consultas.ts` devolve DTOs mínimos (DP-04). A linha do Prisma nunca vai inteira para um Client Component, porque tudo que é prop de cliente é serializado no HTML.
- A chave Pix só aparece em DTO de tela autenticada e respeita a RN-ACE-08. Mascaramento centralizado em `mascararPix` (auditoria, logs, snapshots).
- `import 'server-only'` em `db.ts`, `consultas.ts`, `servico.ts`, `auth/*` e `steam/*`. `process.env` só é lido em `env.ts` (lint: `no-restricted-properties` para `process.env` fora de `src/server/env.ts`, `src/server/db.ts`, `src/instrumentation.ts` e configs).
- **`experimental.taint` não é usado:** troca o React para o canal experimental e não protege valores de baixa entropia como a chave Pix.
- **API key da Steam no header** `x-webapi-key`, não na query string. A URL deixa de carregar segredo, e o log de URL deixa de ser um risco (corrige o [06 §8](06-integracao-steam.md#8-contratos-zod-resumo)).
- Chamadas à Steam: `new URL(constante)` + `searchParams.set`, `fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(5000) })`. `redirect: 'error'` impede que um 30x leve a key ou a requisição a outro host.
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` não é definida: há uma instância só, com build e runtime juntos. _ponytail:_ definir (`openssl rand -base64 32`) se houver 2 instâncias ou build separado.

### SEG-07 — Uploads

A RN-ACE-09 já cobre tipo por _magic bytes_, 5 MB, recusa de SVG/HTML, download autenticado com `nosniff` e nome gerado. Acrescentam-se:

- `Content-Security-Policy: sandbox` no download (SEG-05);
- o PDF sempre como `attachment`, porque o visualizador de PDF do navegador não abre em documento com sandbox;
- metadados EXIF de fotos **não** são removidos. _ponytail:_ o comprovante é, em geral, captura de tela; se alguém enviar foto de câmera com GPS, a remoção entra com `sharp` (hoje fora da imagem).

### SEG-08 — Banco: dois papéis e append-only de verdade

O usuário da aplicação **não pode ser dono das tabelas**. No Postgres, o dono sempre pode reconceder privilégios a si mesmo e desabilitar triggers (`ALTER TABLE … DISABLE TRIGGER`). Com o app como dono (ou superusuário, como o `POSTGRES_USER` do compose de hoje), os triggers append-only da migração `regras` não protegem nada contra um bug ou uma injeção.

| Papel       | Atributos                                                   | Usado por                                                          |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `postgres`  | superusuário da imagem                                      | só o operador, manualmente                                         |
| `app_owner` | `LOGIN NOSUPERUSER NOCREATEROLE`, dono do banco e do schema | `prisma migrate deploy` (serviço `migrate`) e testes de integração |
| `app_rw`    | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`     | o app em runtime                                                   |

- **Criação dos papéis:** script de init do container do Postgres (`docker/initdb/01-papeis.sql`, montado em `/docker-entrypoint-initdb.d`), com as senhas vindas de variáveis. Em produção gerenciada, o operador roda o mesmo script uma vez.
- **Privilégios:** uma migração nova concede `CONNECT`, `USAGE` no schema, `SELECT, INSERT, UPDATE, DELETE` nas tabelas e `USAGE, SELECT` nas sequences (`EventoAuditoria.id` é serial). Também define `ALTER DEFAULT PRIVILEGES FOR ROLE app_owner` para as tabelas futuras.
- **Append-only no privilégio**, além do trigger: `REVOKE UPDATE, DELETE, TRUNCATE` de `app_rw` em `sorteio`, `voto`, `ata`, `adesao` e `evento_auditoria`, e `REVOKE DELETE, TRUNCATE` em `obrigacao`, `pagamento`, `aviso_compra` e `aquisicao` (espelhando `bloquear_mutacao`/`bloquear_delete`). Mais um trigger `BEFORE TRUNCATE … FOR EACH STATEMENT` nessas tabelas, porque `TRUNCATE` não dispara trigger de `DELETE`.
- A migração condiciona o `GRANT` à existência do papel (`DO $$ … IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rw') …`), para não quebrar um banco de desenvolvimento antigo.
- Variáveis: `DATABASE_URL` (app, `app_rw`) e `MIGRATE_DATABASE_URL` (CLI, `app_owner`). O `prisma.config.ts` lê `MIGRATE_DATABASE_URL ?? DATABASE_URL`.
- Nos testes de integração, a limpeza (`TRUNCATE` no `beforeEach`) roda como `app_owner`. **Um teste específico** conecta como `app_rw` e prova que `UPDATE evento_auditoria`, `DELETE FROM voto` e `TRUNCATE ata` falham.
- **Rede:** em produção, a porta do Postgres **não é publicada** no host. Só a rede interna do compose alcança o banco (o `ports:` do compose atual é só de dev). TLS no banco não é necessário nessa topologia; se o banco for remoto, o TLS vai só no objeto `ssl` do adapter, sem `sslmode` na URL (a semântica de `sslmode` muda no `pg` 9).

### SEG-09 — Integridade contra o próprio grupo e o operador

As defesas que o sistema oferece aos membros contra fraude interna:

- **Sorteio verificável:** snapshot dos elegíveis + índice + `sha256` (RN-SOR-08), evidência anexada (RN-SOR-09) e unicidade da execução por rodada. "Sortear de novo" não existe; só a anulação por ATA (RN-SOR-13), que fica registrada.
- **Voto irretratável** e append-only (trigger + privilégio, SEG-08). O placar é nominal (art. 39).
- **Auditoria na mesma transação** de cada mutação, com o ator da sessão. É append-only.
- **Exportação livre** para qualquer membro (RN-ACE-12). Cada um pode guardar a própria cópia e comparar.
- Contra o operador com SQL: triggers e privilégios não o detêm (ele pode usar o `postgres`). Restam o acordo da RN-ACE-11, 2 operadores nomeados em ATA e a exportação periódica pelos membros. _ponytail:_ cadeia de hash na auditoria com o último hash publicado no GRUPO, se houver desconfiança (já registrado na RN-ACE-11).

### SEG-10 — Supply chain (A03:2025)

`pnpm-workspace.yaml`:

```yaml
minimumReleaseAge: 1440 # padrão do pnpm 11, explícito para não sumir num upgrade
trustPolicy: no-downgrade # falha se um pacote perder provenance/trusted publishing
blockExoticSubdeps: true # padrão do pnpm 11
strictDepBuilds: true # padrão do pnpm 11
audit:
  level: high
allowBuilds: { … } # só o que o install pedir (já configurado no M0)
```

- Correção urgente publicada há menos de 1 dia: entra em `minimumReleaseAgeExclude` no PR da correção, e sai no PR seguinte.
- CI: `pnpm install --frozen-lockfile` (já existe) + `pnpm audit --prod --audit-level high` num passo que falha o job.
- Dependabot semanal para `npm` e `github-actions`, com `cooldown: { default-days: 3 }` e um grupo por ecossistema. Os alertas de segurança do Dependabot ficam ligados. Se o Dependabot não entender o lockfile do pnpm 11, a troca é pelo Renovate.
- Actions pinadas por SHA completo, com a versão em comentário (já é assim no `ci.yml`). **Configuração manual no GitHub** (Settings → Actions): exigir SHA completo e `permissions` padrão somente leitura.
- Versões exatas de `next`, `prisma`, `@prisma/client` e `@prisma/adapter-pg` (já é assim). Nunca `pnpm add prisma` sem versão, porque o `latest` é a 8.0 RC.
- **Política de advisories:**
  - crítico em `next`, `react`, `react-dom` ou `prisma` → PR de correção em até 48 h;
  - alto → até a próxima sprint;
  - o Next está em 16.3.6, que fecha o RCE do `ImageResponse` e o RCE AVIF; a 16.3.7 (prevista para 30/09/2026) entra assim que passar o `minimumReleaseAge`;
  - o app não usa `next/og`, otimizador de imagem, custom server nem i18n no proxy, o que já o tira da superfície da maioria dos advisories de 2026.

### SEG-11 — Erros, logs e limites (A09/A10:2025)

- **Ao cliente, mensagem genérica.** `ErroDeNegocio` tem mensagem catalogada e segura para mostrar. Qualquer outro erro vira "Não foi possível concluir" (UI-13), e o Next em produção já esconde a mensagem de erros de Server Component (só o `digest` chega ao cliente).
- **No log:** JSON com `digest`, rota, `pessoaId` e código. Sem chave Pix, token, conteúdo de comprovante, corpo de requisição ou URL com segredo (RN-ACE-15).
- **Eventos de segurança** que vão para o log (e, quando fazem sentido para o grupo, para a auditoria):
  - login recusado (`auth.falha`, `auth.nao_autorizado`);
  - acesso negado pelo guard (`acesso.negado`, com action e perfil);
  - Bearer do tick inválido;
  - upload recusado.
- Falha ao gravar a auditoria **aborta a mutação** (mesma transação). Não existe "gravou o dado, perdeu o rastro".
- **Limites:** login com 10/min por IP (RN-ACE-13, em memória); `bodySizeLimit` de 6 MB; timeouts de banco (DP-09) e da Steam (SEG-06). As actions não têm rate limit: são 5 usuários conhecidos, e o abuso fica visível na auditoria.

### SEG-12 — Container e hospedagem

- Já implementado: runner sem root (uid 1000), sem npm/corepack na imagem, `tini` e `HEALTHCHECK`.
- No `docker-compose.prod.yml` (M9), para `app`, `migrate` e `cron`: `security_opt: [no-new-privileges:true]` e `cap_drop: [ALL]`. _ponytail:_ `read_only: true` + `tmpfs: /tmp` depois de confirmar que o standalone não grava em `.next/cache` sem ISR.
- HTTPS no Caddy (certificado automático); o app só escuta na rede interna.
- **Backups** contêm dados pessoais: o `pg_dump` diário é cifrado (`age`, com a chave pública dos 2 operadores) antes de sair do servidor. A restauração é testada no M9 (já previsto).
- `CRON_SECRET`, senhas do banco e `STEAM_API_KEY` ficam em arquivo `.env` de produção com `chmod 600`, fora do repositório. A rotação da `STEAM_API_KEY` é feita no painel da Steam e exige só reiniciar o app.

## 4. Mapa OWASP Top 10:2025

| Categoria                                  | Onde está tratado                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| A01 Broken Access Control (inclui SSRF)    | SEG-01 (guard por action, IDOR), RN-ACE-03/07, SEG-04 e SEG-06 (sem fetch de URL do usuário, `redirect: 'error'`) |
| A02 Security Misconfiguration              | SEG-05 (CSP, headers, `remotePatterns` fora), `env.ts` (boot recusa config inválida), SEG-12                      |
| A03 Software Supply Chain Failures         | SEG-10                                                                                                            |
| A04 Cryptographic Failures                 | tokens aleatórios de 32 bytes com hash, HTTPS/HSTS, backup cifrado (SEG-02, SEG-12)                               |
| A05 Injection                              | Prisma parametrizado, sem `$queryRawUnsafe`, React/Markdown sem HTML cru, CSV (SEG-04)                            |
| A06 Insecure Design                        | valores calculados no servidor, sem admin, efeitos tipados de votação (SEG-01, ADR-006)                           |
| A07 Authentication Failures                | RN-STM-01 (OpenID endurecido), SEG-02, rate limit de login                                                        |
| A08 Software or Data Integrity Failures    | append-only por trigger e privilégio, hash do Regulamento e do sorteio (SEG-08, SEG-09)                           |
| A09 Security Logging and Alerting Failures | SEG-11; alerta do monitor externo sobre `/api/saude` (08 §8.3)                                                    |
| A10 Mishandling of Exceptional Conditions  | auditoria na transação, `P2028` → erro tratado, timeouts, falha da Steam isolada (SEG-11, DP-08, DP-13)           |

## 5. Verificação

Cenários novos no [09 §9](09-cenarios-de-aceitacao.md#9-acesso-e-segurança) (CA-169 a CA-177):

- toda exportação de `acoes.ts` passa por `acao()`;
- action chamada sem sessão → `NAO_AUTENTICADO`; com sessão de outro membro sobre recurso alheio → `SEM_PERMISSAO` + log;
- `app_rw` não consegue `UPDATE`/`DELETE`/`TRUNCATE` nas tabelas append-only;
- exportação CSV neutraliza fórmulas;
- `x-webapi-key` no header e URL sem `key=` (fixture do `fetch` injetado);
- colar link de loja na lista de desejos não gera `fetch` para o link;
- resposta HTML tem `Content-Security-Policy` com nonce, e o download de anexo tem `sandbox`;
- cookie de sessão com prefixo `__Host-` quando `APP_URL` é https;
- campo HTML do `appdetails` não é gravado.

## 6. Onde isso entra no plano

| Item                                                                                                     | Marco |
| -------------------------------------------------------------------------------------------------------- | ----- |
| Papéis do banco, migração de privilégios, `MIGRATE_DATABASE_URL`, teste de privilégio (SEG-08)           | M1    |
| Marca de `acao()` + teste de guarda (SEG-01); ESLint `react/no-danger`, `$queryRawUnsafe`, `process.env` | M1    |
| `remotePatterns` fora, COOP, `trustPolicy` e `audit` no pnpm, `pnpm audit` no CI, Dependabot (SEG-05/10) | M1    |
| Cookies `__Host-`/`__Secure-`, `env.ts` exigindo https (SEG-02); CSP no `proxy.ts`                       | M2    |
| Chamadas à Steam com header, `redirect: 'error'` e schemas sem campos HTML (SEG-04/06)                   | M3    |
| Download com `sandbox` (SEG-07); CSV neutralizado (SEG-04)                                               | M5    |
| Compose de produção endurecido, backup cifrado (SEG-12)                                                  | M9    |
