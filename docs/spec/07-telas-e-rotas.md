# 07 — Telas, rotas e componentes

Interface em pt-BR, **mobile-first** (o membro paga o Pix pelo celular), tema claro e escuro, shadcn/ui + Tailwind v4. Horários sempre com a indicação "horário de Brasília".

## 1. Mapa de rotas (App Router)

```text
src/app/
├─ (publico)/
│  └─ entrar/page.tsx                    Login ("Entrar com Steam")
├─ (onboarding)/
│  ├─ layout.tsx                         guard: PENDENTE (ou cadastro incompleto)
│  └─ boas-vindas/page.tsx               completar cadastro + assinar Regulamento
├─ (app)/
│  ├─ layout.tsx                         guard: MEMBRO | EX_*; shell com navegação
│  ├─ page.tsx                           Painel (pendências + agora)
│  ├─ rodadas/page.tsx                   lista de rodadas (ciclo atual por padrão)
│  ├─ rodadas/[id]/page.tsx              detalhe (abas via ?aba=)
│  ├─ ciclos/page.tsx                    lista de ciclos
│  ├─ ciclos/[numero]/page.tsx           grade membros × rodadas + janela de revisão
│  ├─ financeiro/page.tsx                quem deve a quem
│  ├─ financeiro/[pessoaId]/page.tsx     extrato da pessoa
│  ├─ votacoes/page.tsx                  abertas / encerradas
│  ├─ votacoes/nova/page.tsx             convocar (?assunto=&objeto=)
│  ├─ votacoes/[id]/page.tsx             votar + placar
│  ├─ atas/page.tsx                      lista de ATAs
│  ├─ atas/[numero]/page.tsx             ATA (modelo do Anexo II, pronta para imprimir)
│  ├─ bloqueados/page.tsx                Anexo I
│  ├─ membros/page.tsx                   membros e ex-membros
│  ├─ membros/[pessoaId]/page.tsx        perfil público: jogos, desejos, histórico
│  ├─ familia/page.tsx                   integrantes, vagas, biblioteca compartilhável
│  ├─ jogos/[appId]/page.tsx             detalhe do jogo: quem tem, quem deseja, bloqueio
│  ├─ lista-de-desejos/page.tsx          a minha lista
│  ├─ regulamento/page.tsx               versão vigente + histórico
│  ├─ regulamento/[numero]/page.tsx      versão específica + assinaturas
│  ├─ auditoria/page.tsx                 trilha filtrável
│  └─ perfil/page.tsx                    meus dados, Pix, Steam, sessões, declarações pessoais
└─ api/
   ├─ auth/steam/route.ts                inicia o OpenID
   ├─ auth/steam/callback/route.ts       valida e cria a sessão
   ├─ auth/dev/route.ts                  só dev/test (RN-ACE-14)
   ├─ anexos/[id]/route.ts               download autenticado
   ├─ exportar/route.ts                  CSV/JSON
   ├─ saude/route.ts                     { ok, db, ultimoTick } para monitor
   └─ cron/tick/route.ts                 job (Bearer CRON_SECRET)
```

Convenções de roteamento:

- **Route groups** separam os guards: `(publico)`, `(onboarding)`, `(app)`. O guard do layout só **redireciona**; toda Server Action e toda query **refazem** a autorização (RN-ACE-03).
- Abas e filtros ficam na URL (`?aba=pagamentos`, `?status=abertas`), com links compartilháveis e sem estado escondido.
- Mutações usam **Server Actions** (`src/features/*/acoes.ts`), inclusive "Sair" e "Sair de todos". Route Handlers existem só para OpenID, login dev (RN-ACE-14), download, exportação, saúde e cron.
- Cada segmento tem `loading.tsx` (skeleton) e `error.tsx`. `not-found.tsx` é global.
- "Tempo real": as páginas de votação aberta e de rodada no dia do sorteio fazem `router.refresh()` a cada 15 s enquanto a aba está visível. Sem websocket.

## 2. Navegação

Barra lateral (desktop) ou menu em _sheet_ (celular), com o selo de pendências:

1. **Painel**
2. **Rodadas** (atalho para a rodada atual)
3. **Financeiro**
4. **Votações** (contador de abertas sem meu voto)
5. **Família & jogos**: família, biblioteca, membros, minha lista de desejos
6. **Regulamento**: texto, ATAs, Anexo I
7. **Auditoria**
8. Avatar → **Perfil**, Sair

O `EX_COM_PENDENCIA` vê só **Painel**, **Financeiro** (o próprio extrato), **Perfil**, a **rodada em que é contemplado** (aberta, ou fechada dentro do prazo do art. 20, só para reembolso) e `/atas/[numero]` das ATAs que o citam (pelos links do extrato).

## 3. Telas

### 3.1 `/entrar`

- Botão "Entrar com Steam" (padrão visual da Steam) → `/api/auth/steam`.
- Erros por `?erro=`: `nao_autorizado` (texto neutro), `falha` e `expirado`.
- Nota curta: "Só membros do consórcio. Seu login é a sua conta Steam."

### 3.2 `/boas-vindas` (onboarding, RN-ACE-06)

Etapas em um formulário (react-hook-form + zod):

1. **Conta Steam:** avatar, nick e código de amigo (só leitura) e status de privacidade com o guia (06 §7).
2. **Dados:** nome, apelido, chave Pix e tipo (com a dica "prefira chave aleatória").
3. **Declarações:** "sou maior de idade"; "não participo do consórcio com outra conta Steam".
4. **Regulamento:** texto integral rolável, com hash e versão, **e a tabela atual do Anexo I** (entradas vigentes e excluídas); checkbox com a declaração literal do bloco de assinaturas. Botão "Assinar".
5. Depois de assinar: "Aguardando os demais fundadores (3/5)" ou "Você entra no ciclo nº N em 03/MM".

### 3.3 `/` Painel

- **Agora:** ciclo atual (nº, mês x de y), próxima data (sorteio, vencimento, fim de janela) com contagem regressiva.
- **Minhas pendências** (§4), ordenadas por prazo, cada uma com a ação na própria linha.
- **Pendências do grupo** (§4.2).
- **Resumo da rodada atual:** contemplado, prêmio, status do jogo, pagamentos (x/y).
- Atalho "Copiar para o GRUPO" do último evento.

### 3.4 `/rodadas/[id]` (abas)

Cabeçalho: mês de referência, status, contemplado (avatar) e tipo, prazos (pagamento, compra) com `Prazo`.

| Aba            | Conteúdo                                                                                                                                                                                                                                                                   | Ações (com as regras)                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sorteio**    | antes: data e hora, lista de participantes com a situação prevista (elegível, motivo), declarações de não concorrer. Depois: elegíveis, motivos dos inelegíveis, índice sorteado, hash do snapshot, quem disparou, evidências                                              | "Não vou concorrer" / "Voltar a concorrer" (RN-SOR-12); "Justificar antecipadamente" (RN-FIN-03); "Realizar sorteio" (RN-SOR-02, só depois do horário); "Anexar captura" (RN-SOR-09); copiar texto                                                                                                                                                                                                                  |
| **Pagamentos** | grade: pagante, valor, vencimento efetivo, situação (no prazo, prorrogado, em atraso, quitado em atraso, contestado), comprovante; prêmio nominal × recebido; SOBRA recebida                                                                                               | "Paguei" (upload + `pixEm`; com cessão aprovada, escolher o recebedor), "Justificar" (devedor), "Confirmar"/"Contestar"/"Retirar contestação" (recebedor), "Cancelar" (devedor) (RN-FIN-03/04/05)                                                                                                                                                                                                                   |
| **Jogo**       | aviso vigente com validações V1–V12 (ícone, artigo, mensagem), status, contagem da janela, votações ligadas, declarações de posse; aquisições (valor, comprovante, verificação, irregularidades); gasto, complementação, sobra e destino; histórico de avisos substituídos | contemplado (M ou X): "Avisar jogo", "Registrar compra", "Registrar reembolso", "Transferir como SOBRA" (depois de reembolso, antes do prazo), "Aquisição concluída", "Anexar print da biblioteca" (se `NAO_VERIFICAVEL`). Qualquer membro: "Convocar veto" (na janela), "Eu tenho este jogo" / "Retirar 'eu tenho'" (16 IV, antes da autorização), "Convocar autorização 16 IV", "Marcar compartilhamento perdido" |
| **Cessão**     | proposta ou votação em curso e histórico                                                                                                                                                                                                                                   | contemplado: "Propor cessão"; beneficiário: "Aceitar" ou "Recusar"; cedente: "Retirar"                                                                                                                                                                                                                                                                                                                              |
| **Registro**   | linha do tempo (auditoria da rodada e das entidades ligadas)                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                                                                   |

### 3.5 `/ciclos/[numero]`

- **Grade** (a "planilha"): linhas = participantes; colunas = rodadas. Célula = situação da contribuição (✓ no prazo, ⏱ prorrogado, ⚠ em atraso, ✓⚠ quitado em atraso, ★ contemplado/autoquitado, — não pagante). Rodapé por coluna: contemplado, prêmio, gasto, sobra.
- Participantes: contemplado em (mês), postergado (motivo), impossibilitado, saiu.
- Conservação do ciclo (RN-FIN-18), com alerta se divergir.
- **Janela de revisão** (em `EM_REVISAO`): prazo, quem confirmou, recusou ou não respondeu; botões "Confirmo" e "Não vou participar" para mim; alterações do Regulamento em andamento e aviso da regra de vigência.

### 3.6 `/financeiro`

- **Quem deve a quem:** matriz devedor × credor com saldos abertos, vencidos em destaque. Clique abre as obrigações do par.
- Lista de obrigações abertas, filtrável por tipo, pessoa e vencidas.
- Botão "Exportar" (CSV/JSON).
- `/financeiro/[pessoaId]`: extrato (contribuições devidas e pagas, prêmios recebidos, gasto e complementação, sobras recebidas e repassadas, rateios, histórico de atraso e postergação, totais).

### 3.7 `/votacoes`, `/votacoes/nova`, `/votacoes/[id]`

- **Lista:** abertas (com encerramento e "você ainda não votou"), encerradas (resultado, nº da ATA).
- **Nova:** selecionar o assunto (catálogo RN-VOT-08, **sem `CESSAO_VEZ`**, que nasce do aceite na aba Cessão) → formulário **específico do efeito** (união discriminada zod): escolher o aviso, a pessoa, a entrada do Anexo I, o texto proposto do Regulamento (editor markdown com diff contra a vigente e parâmetros)… Em seguida a proposição (pré-preenchida, editável) e a justificativa. Antes de confirmar, mostra `n`, quórum, encerramento e alertas (ex.: "a alteração só vale em 01/MM").
- **Detalhe:** proposição, efeito, placar ao vivo (a favor, contra, abstenção e pendentes, com nomes), quórum, "faltam X votos a favor" e "rejeição antecipada se…". Botões Favor / Contra / Abstenção com confirmação ("voto irretratável"). Botão "Cancelar votação" para o convocante enquanto ninguém mais votou (nunca em `VETO_JOGO`). Ao encerrar: resultado, link da ATA e texto para o GRUPO.

### 3.8 `/atas/[numero]`

Renderização fiel ao **Anexo II** (nº, data, convocante, assunto marcado, descrição, votos com nomes, resultado), mais os extras e o hash. CSS de impressão (`@media print`) para gerar PDF pelo navegador. A `markdown` imutável é a fonte.

### 3.9 `/bloqueados` (Anexo I)

Tabela `Nº | Jogo | Data do veto | Motivo | ATA nº | Situação` (vigente ou excluída em … pela ATA …). Botão "Propor exclusão" (desabilitado na entrada 01, com a explicação do art. 17).

### 3.10 `/familia`

- **Integrantes:** membros e não membros, status (convite autorizado, ativo, remoção autorizada), membro ou não membro e entrada. Ação "Registrar execução na Steam" nos vínculos autorizados.
- **Vagas:** capacidade (6), ocupadas, bloqueadas até … e livres (RN-CAD-11); "Editar bloqueio" (com justificativa).
- **Biblioteca compartilhável** (RN-STM-12): grade de jogos com capa, filtro (todos, compartilháveis, verificando), busca, donos e contagem de cópias.
- Painel informativo das regras da Família Steam (RN-STM-13).

### 3.11 `/membros/[pessoaId]` e `/jogos/[appId]`

- **Membro:** avatar, nick, código de amigo, status, situação no ciclo, contemplações, jogos (com filtro de compartilháveis), lista de desejos (ordem, preço atual, selo de bloqueado) e privacidade Steam. Ação "Transcrever ato do GRUPO" (RN-GER-05): tipo (não concorrer, confirmação/recusa de ciclo, justificativa), rodada ou obrigação, horário da mensagem e print.
- **Jogo:** capa, tipo, preço BRL, categorias relevantes, descritores, quem possui, quem deseja (posição) e bloqueio (entrada do Anexo I).

### 3.12 `/lista-de-desejos`

Itens da Steam (só leitura, na ordem da Steam) + itens manuais (adicionar por link, appId ou busca; reordenar arrastando ou com botões ↑↓; remover). "Sincronizar com a Steam" (RN-STM-04).

### 3.13 `/regulamento`

Texto da versão vigente com âncoras por artigo (`#art-23`), versões (número, vigência, ATA), assinaturas da versão (nome, data, hash) e alterações aprovadas aguardando vigência.

### 3.14 `/perfil`

Dados, chave Pix (com aviso ao trocar sendo credor), estado da Steam + sincronizar, sessões ativas ("sair de todos"), exportar meus dados. **Zona de declarações** com consequências explícitas e `ConfirmarAcao`: "Declarar impossibilidade de pagamento (art. 30)", "Sair do consórcio (arts. 32/33)", "Sair da Família Steam". Ex-membro quitado: "Pedir anonimização".

### 3.15 `/auditoria`

Tabela paginada com filtro por entidade, ator, ação e período; o diff antes/depois é expandível.

## 4. Painel de pendências (regras)

Calculado por `pendenciasDe(pessoaId, agora)` a partir do estado (sem tabela de notificações).

### 4.1 Minhas

| Pendência                               | Quando aparece                                                                                          | Ação                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Completar cadastro / assinar            | requisito de RN-CAD-02 faltando                                                                         | → `/boas-vindas`                                                    |
| **Pagar R$ X a Fulano até …**           | obrigação aberta como devedor                                                                           | "Paguei", "Justificar" (se antes do vencimento), chave Pix copiável |
| Confirmar recebimento                   | pagamento `DECLARADO` em que sou `recebedorId`                                                          | Confirmar / Contestar                                               |
| Anexar print da biblioteca              | minha aquisição com verificação `NAO_VERIFICAVEL`                                                       | upload                                                              |
| Votar                                   | eleitor, votação aberta, sem voto                                                                       | → votação                                                           |
| Sorteio em …                            | rodada `AGENDADA`, participo (ou sou participante previsto), não contemplado; ou sou X pagante do ciclo | "Não vou concorrer" (M) / "Justificar antecipadamente" (M ou X)     |
| Você foi contemplado: avise o jogo      | contemplado, sem aviso ativo                                                                            | "Avisar jogo"                                                       |
| Janela de veto até …                    | contemplado com aviso em janela                                                                         | contagem                                                            |
| Compra autorizada: compre até …         | aviso `AUTORIZADO`                                                                                      | "Registrar compra"                                                  |
| Conclua a aquisição                     | aquisição registrada, rodada aberta                                                                     | "Aquisição concluída"                                               |
| Aceitar cessão                          | beneficiário `AGUARDANDO_ACEITE`                                                                        | Aceitar / Recusar                                                   |
| Confirmar participação no próximo ciclo | janela aberta, sem resposta                                                                             | Confirmo / Não participo                                            |
| Ato transcrito em seu nome              | declaração com `registradaPorId ≠ pessoaId` nas últimas 72 h                                            | ver / revogar                                                       |
| Perfil Steam privado                    | `steamJogosPublicos = false`                                                                            | guia                                                                |

### 4.2 Do grupo

| Pendência                                       | Quando                                                                                                                                                                   | Ação sugerida                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Anexar captura do sorteio                       | rodada executada sem evidência (RN-SOR-09)                                                                                                                               | upload                                             |
| Prazo de compra vencido sem aquisição           | RN-COM-13                                                                                                                                                                | convocar caso omisso (`CONVERTER_PREMIO_EM_SOBRA`) |
| Aquisição irregular                             | `irregularidades ≠ ∅` sem ATA                                                                                                                                            | convocar caso omisso (`REGULARIZAR_AQUISICAO`)     |
| Deliberar permanência (art. 30)                 | membro `IMPOSSIBILITADO` sem votação aberta e sem ATA `PERMANENCIA_ART30` desde `impossibilitadoDesde` (com ATA rejeitada: "convocar `RETORNO_SORTEIOS` ou caso omisso") | convocar                                           |
| 2 rodadas sem contemplado seguidas              | RN-SOR-11                                                                                                                                                                | convocar caso omisso                               |
| Contestação de pagamento aberta                 | `CONTESTADO`                                                                                                                                                             | convocar caso omisso (validar ou invalidar)        |
| Convite ou remoção aguardando execução na Steam | vínculo `*_AUTORIZADO`                                                                                                                                                   | registrar execução                                 |
| Contemplado fora da família antes da compra     | RN-COM-14                                                                                                                                                                | caso omisso                                        |
| Divergência de conservação                      | RN-FIN-18 falhou                                                                                                                                                         | investigar (bug ou dado)                           |
| Nova versão entra em vigor em …                 | versão aprovada aguardando vigência                                                                                                                                      | ler o resumo                                       |

## 5. Textos para o GRUPO

`src/features/grupo/textos.ts`: funções puras `(evento) => string`. Sem chave Pix, com link absoluto. Exemplos:

```text
🎲 Sorteio de outubro/2026 (ciclo 1, rodada 1) — 03/10 12:00
Concorreram: Ana, Bruno, Caio, Duda, Edu
Contemplado: Caio 🎉  (hash 3f9a…c21)
Pagamento: R$ 25,00 para Caio até hoje 23:59 (ou justifique para ir até 10/10)
Detalhes: https://…/rodadas/…
```

```text
🕹️ Caio avisou o jogo: Hades II (R$ 89,99)
Validações: ✅ compartilhável ✅ fora do Anexo I ✅ ninguém tem
Janela de veto até 05/10 20:14 — https://…/rodadas/…?aba=jogo
```

```text
🗳️ Votação aberta: Veto de jogo (art. 23) — Hades II
Encerra até 07/10 18:02 ou ao atingir 3 votos a favor
Votar: https://…/votacoes/…
```

```text
📜 ATA nº 4 — Veto de jogo — APROVADO (3 a favor, 1 contra, 1 abstenção)
Hades II entrou no Anexo I (nº 02). https://…/atas/4
```

Outros templates: rodada sem contemplado (com motivo), lembrete de pagamento (19:00 do dia), compra registrada, rodada fechada com SOBRA (valor e destinatário), janela de revisão aberta, nova versão em vigor, resultado de cessão.

## 6. Componentes

### 6.1 shadcn/ui (em `src/components/ui`, gerados pela CLI)

`button, card, badge, alert, alert-dialog, dialog, sheet, dropdown-menu, form, input, textarea, select, radio-group, checkbox, switch, label, tabs, table, tooltip, popover, hover-card, command, avatar, skeleton, separator, scroll-area, progress, sidebar, breadcrumb, sonner, pagination`. Tabelas são `table` + `pagination` renderizadas no servidor, com filtros e página em `searchParams` (sem TanStack Table).

### 6.2 Compartilhados de domínio (`src/components`)

| Componente                       | Responsabilidade                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Dinheiro`                       | `centavos → "R$ 1.234,56"` (`Intl.NumberFormat('pt-BR')`), com prop `sinal`                                         |
| `DataHora`                       | instante formatado em SP (`dd/MM HH:mm`), com tooltip ISO e modo relativo ("em 3 h")                                |
| `Prazo`                          | contagem regressiva com tom: neutro (> 24 h), atenção (< 24 h), perigo (vencido); `aria-label` completo             |
| `StatusBadge`                    | mapeia cada enum para rótulo pt-BR e variante; um único dicionário em `src/lib/rotulos.ts`                          |
| `PessoaAvatar`                   | avatar Steam + apelido; link para o perfil                                                                          |
| `ArtigoRef`                      | `<ArtigoRef art="23" par="2" />`: tooltip com o texto do artigo na versão vigente e link para `/regulamento#art-23` |
| `CopiarTexto` / `TextoParaGrupo` | copiar para a área de transferência, com toast                                                                      |
| `UploadComprovante`              | arquivo (jpeg, png, webp, pdf, ≤ 5 MB), prévia, `pixEm` (data e hora) obrigatório                                   |
| `ConfirmarAcao`                  | alert-dialog com a lista de consequências e checkbox "entendi" para atos graves                                     |
| `ValidacoesProduto`              | lista V1–V12 com ícone, mensagem, artigo e campo de declaração quando exigida                                       |
| `PlacarVotacao`                  | barras a favor, contra, abstenção e pendentes, com linha do quórum e nomes                                          |
| `LinhaDoTempo`                   | eventos de auditoria de uma entidade                                                                                |
| `Markdown`                       | renderização segura de texto normativo e livre (RN-ACE-15)                                                          |
| `EstadoVazio`, `CabecalhoPagina` | layout consistente                                                                                                  |
| `SteamAppCard`                   | capa, nome, preço, selos (compartilhável, bloqueado, DLC)                                                           |

### 6.3 Regras de componentização

- **Server Components por padrão.** `"use client"` só em interação: formulários, diálogos, contagem, copiar, drag-and-drop.
- Componentes de feature ficam em `src/features/<feature>/componentes/`. Vão para `src/components/` só depois do **segundo uso** entre features.
- Um componente, um arquivo, exportação nomeada; props tipadas com `type` (não `interface` de uma implementação só).
- Formulários: `react-hook-form` + `@hookform/resolvers/zod` com o **mesmo schema** que a Server Action valida (`src/features/<f>/schemas.ts`).
- Markdown (Regulamento, ATA, proposição, justificativa) só via o componente `Markdown` (`react-markdown` + `remark-gfm`, **sem `rehype-raw`**, âncoras `#art-N` por componente customizado). `dangerouslySetInnerHTML` é proibido (RN-ACE-15). Links externos com `rel="noopener noreferrer"`.
- Sem estado global de cliente: a fonte da verdade é o servidor. Depois de uma action, usar `revalidatePath` ou `refresh()`.

## 7. Acessibilidade e UX

- Contraste AA nos dois temas; cor nunca é o único sinal (status tem ícone e texto).
- Todo controle é acessível por teclado; diálogos com foco preso (Radix).
- Labels explícitos; erros de formulário ligados por `aria-describedby`.
- Valores monetários e prazos com texto completo para leitores de tela.
- Ações irreversíveis (voto, assinatura, saída, sorteio) sempre passam por `ConfirmarAcao`, com a explicação da regra e o artigo.
- Linguagem do Regulamento nos rótulos ("SOBRA", "ATA", "contemplado").
