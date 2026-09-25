# 04 — Acessos, perfis e autenticação

Princípio (art. 3º): **não existe administrador**. Há um único papel humano, o MEMBRO. As permissões extras vêm do **contexto**: ser o contemplado da rodada, o recebedor de um pagamento, o sujeito de uma declaração, o convocante de uma votação. Nenhum contexto permite alterar registro de outra pessoa. Onde um sistema comum teria um admin, aqui existe uma **votação com efeito tipado** (RN-VOT-07).

## 1. Perfis

O perfil é **derivado** a cada requisição por `perfilDe(pessoaId)` (em `src/server/auth/perfil.ts`), a partir de `Pessoa`, `Membro`, obrigações, pagamentos e rodadas. Nada fica gravado no cookie.

| Perfil                    | Condição                                                                                                                                                                                                                                                                                                                                       | Pode                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VISITANTE`               | sem sessão                                                                                                                                                                                                                                                                                                                                     | página de login                                                                                                                                                                                                                                                                                                                                                                                                             |
| `PENDENTE`                | `Membro.status ∈ {AGUARDANDO_ADESAO, AGUARDANDO_CICLO}`                                                                                                                                                                                                                                                                                        | onboarding: próprio cadastro; leitura do Regulamento e do Anexo I vigente (dentro do onboarding); assinatura; sair do consórcio (se `AGUARDANDO_CICLO`)                                                                                                                                                                                                                                                                     |
| `MEMBRO`                  | `Membro.status ∈ {ATIVO, IMPOSSIBILITADO}`                                                                                                                                                                                                                                                                                                     | ler tudo; todas as ações coletivas; votar                                                                                                                                                                                                                                                                                                                                                                                   |
| `EX_COM_PENDENCIA`        | membro encerrado com: obrigação aberta como devedor ou credor; **ou** pagamento `DECLARADO`/`CONTESTADO` em que é `recebedorId`; **ou** papel de contemplado vigente de rodada `CONTEMPLADA` não fechada, ou `FECHADA` com `agora < prazoCompraAte`; **ou** saída depois de contemplado num ciclo `EM_ANDAMENTO` (continua pagante, RN-SAI-03) | ver e pagar as próprias obrigações; confirmar, contestar ou retirar a contestação de pagamentos recebidos; justificar; ler as ATAs que o citam (pelos links do extrato); **na rodada em que é contemplado:** ver a página, registrar ou substituir o aviso, registrar compra e reembolso, marcar "aquisição concluída" e "transferir como SOBRA" (RN-SAI-04); com a rodada `FECHADA` no prazo, só ver e registrar reembolso |
| `EX_QUITADO`              | membro encerrado sem pendência                                                                                                                                                                                                                                                                                                                 | ler e exportar os próprios dados; pedir anonimização                                                                                                                                                                                                                                                                                                                                                                        |
| _(integrante não membro)_ | só `IntegranteFamilia`                                                                                                                                                                                                                                                                                                                         | **nada**: não tem login                                                                                                                                                                                                                                                                                                                                                                                                     |
| `SISTEMA`                 | job `tick` e efeitos de votação                                                                                                                                                                                                                                                                                                                | RN-SOR-02, RN-VOT-07, sincronização Steam                                                                                                                                                                                                                                                                                                                                                                                   |
| `OPERADOR`                | acesso ao servidor e ao banco                                                                                                                                                                                                                                                                                                                  | só a CLI de bootstrap (RN-ACE-10) e a infraestrutura                                                                                                                                                                                                                                                                                                                                                                        |

Papéis de contexto usados na matriz:

- **próprio**: o sujeito do ato;
- **contemplado**: o contemplado vigente da rodada;
- **recebedor**: `Pagamento.recebedorId`;
- **devedor** e **credor**: as partes da obrigação;
- **convocante**, **beneficiário** (cessão) e **alvo** (art. 30).

## 2. Regras de acesso (RN-ACE)

- **RN-ACE-01 — Perfil derivado.** Calculado em cada request e cacheado só durante a request (`React.cache`).
- **RN-ACE-02 — Sem papel administrativo.** Não existe `role`, `isAdmin` nem nada equivalente. Revisão de código que proponha um deve ser rejeitada.
- **RN-ACE-03 — Autorização no servidor.** Toda Server Action e toda query de página chamam um guard que lê o estado atual no banco: `exigirMembro()`, `exigirPerfil(...)`, `exigirContemplado(rodadaId)`, `exigirRecebedor(pagamentoId)`, `exigirDevedor(obrigacaoId)`, etc. Exclusão, saída ou impossibilidade valem na requisição seguinte, sem derrubar a sessão.
- **RN-ACE-04 — Login só com Steam** — _substituída pela RN-FAM-01 (doc 15, D-33): qualquer conta Steam entra como `VISITANTE`; o texto abaixo vale para o acesso ao consórcio de uma família._ (fluxo em [06 §2](06-integracao-steam.md#2-login-com-steam-openid-20)). Entra só quem tem `Pessoa.steamId64` com `Membro` não encerrado ou perfil `EX_*`. Qualquer outra conta, inclusive de integrante não membro, recebe a mensagem neutra "Esta conta Steam não está autorizada". Não há autocadastro: pessoas nascem no bootstrap (fundadores) ou por efeito de ATA (admissão).
- **RN-ACE-05 — Sessão.**
  - Token aleatório de 32 bytes no cookie `__Host-sessao` (`sessao` em `http://localhost`; [14](14-seguranca.md), SEG-02), com `HttpOnly`, `Secure`, `SameSite=Lax` e `Path=/`; o banco guarda só o `sha256`.
  - **Validade fixa de 30 dias**: o `Max-Age` do cookie é igual a `expiraEm`, sem renovação. Ao expirar, um novo login cria outra sessão.
  - "Sair" e "Sair de todos os dispositivos" são **Server Actions** (`sairAcao`, `sairDeTodosAcao`) que revogam as sessões.
- **RN-ACE-06 — Onboarding.** Enquanto faltar requisito da RN-CAD-02, a pessoa é redirecionada a `/boas-vindas`, onde:
  1. confirma nome e apelido (nick e avatar vêm da Steam);
  2. informa a chave Pix e o tipo (recomenda-se a aleatória);
  3. declara maioridade;
  4. declara que não participa com outra conta;
  5. lê o texto integral **e o Anexo I vigente** e assina (RN-REG-07).
- **RN-ACE-07 — Transparência** (arts. 39 e 40).
  - O `MEMBRO` lê **tudo**: pagamentos, comprovantes, sorteios e snapshots, votos nominais, ATAs, listas, bibliotecas, auditoria. Exceção: sessões.
  - O `PENDENTE` lê, dentro do onboarding, o Regulamento, o Anexo I e o próprio cadastro.
  - O `EX_COM_PENDENCIA` lê as próprias obrigações e pagamentos, as ATAs que o citam, a chave Pix **só dos credores com quem tem obrigação aberta** e a página da própria rodada como contemplado (aberta, ou `FECHADA` dentro do prazo do art. 20).
  - O `EX_QUITADO` lê os próprios dados.
- **RN-ACE-08 — Chave Pix.** Visível a todos os `MEMBRO` e ao titular, e ao `EX_COM_PENDENCIA` só para os seus credores. **Nunca** aparece em texto para o GRUPO, em logs, na auditoria ou em snapshots (mascarada, RN-GER-04).
- **RN-ACE-09 — Anexos.**
  - **Upload:** um arquivo por chamada, por `enviarAnexoAcao` (≤ 5 MB), que cria o `Anexo` com `enviadoPorId = ator` e `entidade/entidadeId = null`. O "Paguei" da tela (`pagarAcao`) faz as duas etapas numa ação: grava o anexo e registra o pagamento. Se o registro falhar, o anexo fica solto e só quem o enviou o vê.
    - `mime` = tipo detectado pelos _magic bytes_ (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`, PDF `%PDF-`), nunca o informado pelo cliente. Outros tipos são recusados (HEIC, SVG, HTML…).
    - Gravação de chamada entra só como `linkExterno` com `https:`. Nesse caso: `mime = 'text/uri-list'`, `tamanhoBytes = 0`, `sha256 = sha256hex(utf8(url))`, `conteudo = null`; a UI mostra o link, sem download.
  - **Vínculo:** uma action só aceita `anexoId` com `enviadoPorId = ator` e `entidadeId` nulo, e grava `entidade/entidadeId` na mesma transação. Única exceção: o reuso do mesmo comprovante em outro pagamento do mesmo par devedor/recebedor (RN-FIN-04). Evidências de declaração do aviso usam `entidade = 'aviso'`.
  - **Download** `/api/anexos/[id]`:
    - quem pode baixar:
      - `MEMBRO`: qualquer anexo vinculado;
      - `EX_*`: os que enviou e os comprovantes de `Pagamento` de obrigação em que é devedor ou credor;
      - `PENDENTE`: só os que enviou;
      - anexo não vinculado: só quem o enviou;
      - outros casos: **404**;
    - headers:
      - `Content-Type` = `mime`, `X-Content-Type-Options: nosniff` e `Cache-Control: private, no-store`;
      - `Content-Disposition: inline` para imagem e `attachment` para PDF, com `filename="anexo-<id>.<ext>"`. O nome enviado pelo cliente nunca é usado.
  - Um anexo vinculado não se apaga; só é substituído por correção.
- **RN-ACE-10 — Bootstrap por CLI** (art. 46).
  - **Execução:** `pnpm cli bootstrap ./bootstrap.json` roda só com a tabela `Pessoa` vazia. O arquivo traz os fundadores (nome, apelido, SteamID64 ou URL do perfil, resolvida por `ResolveVanityURL`), os integrantes não membros (com `entrouEm`), o caminho do texto 1.0 e os parâmetros.
  - **Pré-condição:** o texto carregado é o **final**, já com as redações do 03 §3 escolhidas pelos membros.
  - **O que cria:**
    - `Pessoa`, `Membro` (`AGUARDANDO_ADESAO`, `FUNDADOR`) e `IntegranteFamilia` (`PRE_EXISTENTE`, `ATIVO`, com `steamId64` e `entrouEm`);
    - `VersaoRegulamento` 1.0 (`ordem` 0, texto, parâmetros, `sha256` C-HASH, `vigenteDesde = null`);
    - `JogoBloqueado` nº 1 (RN-BLO-01);
    - as linhas de `Controle`;
    - o evento "gênese" (`atorTipo = OPERADOR`), com o `sha256` do arquivo, a divulgar no GRUPO.
  - **Correções antes da vigência:** `pnpm cli corrigir-bootstrap` ajusta fundadores, texto ou parâmetros, com auditoria.
    - Mudar texto ou parâmetros muda o `sha256` e **invalida todas as adesões**.
    - Mudar o `steamId64` de um fundador invalida só a adesão dele (`adesaoValida` compara o código de amigo) e **revoga as sessões dessa pessoa**.
  - Depois da vigência, a CLI recusa qualquer escrita.
- **RN-ACE-11 — Operador sem poder de negócio.** Fora do bootstrap, alterar dados por SQL é proibido por acordo. As defesas são auditoria, exportação livre e backup. Recomendam-se pelo menos 2 operadores, nomeados em ATA (D-29). _ponytail:_ sem cadeia de hash na auditoria; se houver desconfiança, encadear `sha256(anterior || evento)` e publicar o último hash no GRUPO todo mês.
- **RN-ACE-12 — Exportação.**
  - Qualquer `MEMBRO` exporta a base (JSON único + CSV por tabela), **exceto** `sessao`, `nonce_openid`, `controle` e os bytes de `anexo.conteudo` (anexos baixados à parte).
  - Os `EX_*` exportam: a própria `Pessoa`; `Adesao`, `Declaracao` e `Voto` próprios; `Obrigacao` e `Pagamento` em que são devedores ou credores; as ATAs que os citam.
- **RN-ACE-13 — Limites de uso.**
  - Login (`/api/auth/steam` e callback): 10 por minuto por IP. O IP vem do último valor de `X-Forwarded-For` gravado pelo Caddy; o limite fica em memória.
  - Sincronização manual com a Steam: recusada se `agora − steamSincronizadoEm < 10 min`.
  - Uploads: 5 MB por arquivo, um por chamada. `bodySizeLimit` das Server Actions: 6 MB.
- **RN-ACE-14 — Login de desenvolvimento.**
  - `GET /api/auth/dev?steamId64=…` existe só com `NODE_ENV !== 'production'` **e** `DEV_LOGIN=1`.
  - Cria sessão **só para uma `Pessoa` existente** com `Membro` não encerrado ou perfil `EX_*`; nunca cria pessoa.
  - O `env.ts` recusa o boot com `DEV_LOGIN=1` e `NODE_ENV=production`.
  - Um teste de integração garante 404 em produção.
  - O Playwright roda contra `pnpm dev` (08 §5.5).
- **RN-ACE-15 — Segurança HTTP.**
  - **Mutações** só por Server Actions, que verificam a origem e passam pelo guard. As exceções são o callback OpenID (protegido pelo `state`), o login dev (guard duplo) e o tick (Bearer). Toda Server Action exportada é um endpoint POST público e sempre passa pelo guard.
  - **CSP com nonce por requisição**, gerada em `proxy.ts`: `default-src 'self'; script-src 'self' 'nonce-{n}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.steamstatic.com; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://steamcommunity.com`. `'unsafe-eval'` só em dev.
  - **Headers estáticos** em `next.config.ts`: `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` e `Cross-Origin-Opener-Policy: same-origin`. O proxy só monta a CSP, sem autenticar. Modelo de ameaças e decisões complementares: [14](14-seguranca.md).
  - **Segredos:** `STEAM_API_KEY` e `CRON_SECRET` (≥ 32 caracteres) ficam só no servidor. O tick compara o Bearer com `crypto.timingSafeEqual`.
  - **Logs** não levam PII (chave Pix, comprovante, token) nem URLs com `key=`.
  - **Markdown** (Regulamento, ATA, proposição, justificativa) é renderizado com `react-markdown` + `remark-gfm`, **sem `rehype-raw`**: HTML escapado e `urlTransform` padrão. `dangerouslySetInnerHTML` é proibido.
- **RN-ACE-16 — Troca de conta Steam.** Ninguém altera o próprio SteamID64. A troca é feita só por ATA `REVINCULAR_STEAM` (RN-VOT-09), que **revoga todas as sessões da pessoa** na mesma transação. Com `incluirNaFamilia`, a mesma ATA remove a conta antiga e autoriza o convite da nova (art. 7º), e o sistema alerta sobre o bloqueio de 1 ano.
- **RN-ACE-17 — Dados pessoais** (boa prática de LGPD; a lei pode nem se aplicar, pelo art. 4º, I).
  - Coleta mínima: sem CPF, data de nascimento ou endereço.
  - Acesso aos próprios dados via exportação; anonimização do ex-membro quitado (RN-CAD-15).
  - Retenção: enquanto o consórcio existir. No encerramento, exportar e apagar em 90 dias, salvo dívidas em aberto.

## 3. Matriz de permissões

Legenda: **M** = MEMBRO (`ATIVO`/`IMPOSSIBILITADO`); **P** = PENDENTE; **X** = EX_COM_PENDENCIA; **S** = SISTEMA. Toda ação gera auditoria.

### 3.1 Identidade e cadastro

| Ação                                             | Quem                                  | Condições                                  | Regra     |
| ------------------------------------------------ | ------------------------------------- | ------------------------------------------ | --------- |
| Entrar com Steam                                 | M, P, X, EX_QUITADO                   | SteamID na lista (RN-ACE-04)               | RN-STM-01 |
| Sair / sair de todos                             | qualquer sessão                       | Server Action                              | RN-ACE-05 |
| Editar o próprio apelido e nome                  | próprio                               | nome congelado nas adesões                 | RN-CAD-01 |
| Alterar a própria chave Pix                      | próprio                               | notifica os pagadores com obrigação aberta | RN-CAD-05 |
| Ver a chave Pix de outro                         | M; X só dos seus credores             | —                                          | RN-ACE-08 |
| Declarar maioridade e assinar a versão           | próprio (P)                           | versão aplicável; declaração literal       | RN-REG-07 |
| Sincronizar os próprios dados Steam              | próprio                               | 1 a cada 10 min                            | RN-STM-04 |
| Editar a lista de desejos (itens manuais, ordem) | próprio                               | —                                          | RN-COM-01 |
| Alterar o SteamID64                              | ninguém; S por ATA `REVINCULAR_STEAM` | revoga as sessões                          | RN-ACE-16 |
| Pedir anonimização                               | próprio (EX_QUITADO)                  | sem pendência                              | RN-CAD-15 |

### 3.2 Família e composição

| Ação                                              | Quem                                                         | Condições                                                | Regra                |
| ------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- | -------------------- |
| Registrar execução na Steam de convite ou remoção | M                                                            | vínculo `CONVITE_AUTORIZADO` ou `REMOCAO_AUTORIZADA`     | RN-CAD-08/09         |
| Declarar a própria saída da família               | próprio (M, X); **sem transcrição**                          | confirmação com consequências                            | RN-CAD-10            |
| Declarar a própria saída do consórcio             | próprio (M, ou P em `AGUARDANDO_CICLO`); **sem transcrição** | idem                                                     | RN-SAI-01            |
| Declarar impossibilidade de pagamento             | próprio (M); **sem transcrição**                             | —                                                        | RN-SAI-06            |
| Confirmar ou recusar o próximo ciclo              | próprio (M), ou transcrição                                  | dentro da janela; transcrição até o prazo de confirmação | RN-CIC-05, RN-GER-05 |
| Editar a data de bloqueio de vaga                 | M                                                            | justificativa obrigatória                                | RN-CAD-11            |

### 3.3 Sorteio

| Ação                                | Quem                                                  | Condições                                                                | Regra     |
| ----------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | --------- |
| Declarar ou revogar "não concorrer" | próprio (M; participante ou previsto), ou transcrição | rodada `AGENDADA`, antes do corte, fora do art. 14                       | RN-SOR-12 |
| Registrar justificativa antecipada  | próprio (M, ou X pagante do ciclo), ou transcrição    | antes do sorteio                                                         | RN-FIN-03 |
| Realizar o sorteio                  | S; M como reserva                                     | `agora ≥ agendadaPara`, rodada `AGENDADA`, anterior executada            | RN-SOR-02 |
| Anexar evidência ao sorteio         | M                                                     | só acumula; link https                                                   | RN-SOR-09 |
| Anular sorteio                      | ninguém; S por ATA `ANULAR_RODADA`                    | sem aquisição, ciclo `EM_ANDAMENTO` e nenhuma rodada posterior executada | RN-SOR-13 |

### 3.4 Financeiro

| Ação                               | Quem                                    | Condições                                                       | Regra     |
| ---------------------------------- | --------------------------------------- | --------------------------------------------------------------- | --------- |
| Registrar pagamento                | devedor (M ou X), credor ou qualquer M  | comprovante (ou forma diversa); valor ≤ saldo; pagador derivado | RN-FIN-04 |
| Confirmar ou contestar recebimento | **recebedor** (M ou X)                  | pagamento `DECLARADO`                                           | RN-FIN-05 |
| Retirar contestação                | **recebedor** (M ou X)                  | pagamento `CONTESTADO`                                          | RN-FIN-05 |
| Cancelar pagamento declarado       | **devedor**                             | `DECLARADO` ou `CONTESTADO`                                     | RN-FIN-05 |
| Justificar e prorrogar             | devedor (M ou X), ou transcrição        | antes do vencimento (transcrição até +48 h)                     | RN-FIN-03 |
| Cancelar obrigação                 | ninguém; S por ATA `CANCELAR_OBRIGACAO` | —                                                               | RN-VOT-09 |
| Ver quem deve a quem e extratos    | M (tudo); X (os próprios)               | —                                                               | RN-FIN-19 |
| Exportar                           | M (tudo); X/EX (os próprios)            | RN-ACE-12                                                       | RN-ACE-12 |

### 3.5 Jogo do mês

| Ação                                                               | Quem                          | Condições                                                                 | Regra     |
| ------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------- | --------- |
| Registrar ou substituir aviso de compra                            | contemplado (M ou X)          | rodada `CONTEMPLADA` não fechada, sem cessão em andamento, antes do prazo | RN-COM-03 |
| Declarar ou retirar "eu tenho este jogo" (16 IV)                   | próprio (M)                   | aviso ativo, antes da autorização                                         | RN-COM-07 |
| Registrar compra                                                   | **só o contemplado (M ou X)** | comprovante; revalidação                                                  | RN-COM-09 |
| Marcar "aquisição concluída"                                       | contemplado (M ou X)          | ≥ 1 aquisição ativa; sem cessão em andamento                              | RN-FIN-13 |
| Registrar reembolso e escolher o destino ("transferir como SOBRA") | contemplado (M ou X)          | sem cessão em andamento                                                   | RN-COM-12 |
| Anexar print da biblioteca                                         | contemplado (M ou X)          | verificação `NAO_VERIFICAVEL`                                             | RN-COM-11 |
| Marcar "compartilhamento perdido"                                  | M                             | informativo                                                               | RN-COM-16 |

### 3.6 Cessão

| Ação                                | Quem                          | Condições                    | Regra     |
| ----------------------------------- | ----------------------------- | ---------------------------- | --------- |
| Propor cessão                       | contemplado                   | RN-CES-01/02                 | RN-CES-01 |
| Aceitar ou recusar ser beneficiário | beneficiário (não transcrito) | proposta `AGUARDANDO_ACEITE` | RN-CES-03 |
| Retirar a proposta                  | cedente                       | até a aprovação              | RN-CES-03 |

### 3.7 Votações e Anexo I

| Ação                                                     | Quem                                       | Condições                                        | Regra        |
| -------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------ | ------------ |
| Convocar votação                                         | M                                          | RN-VOT-01; veto na janela; cessão só pelo aceite | RN-VOT-01    |
| Votar                                                    | eleitor do snapshot, ainda M, não impedido | votação aberta, antes de `encerraEm`             | RN-VOT-03    |
| Cancelar a votação                                       | convocante                                 | antes de votos de outros; **nunca** `VETO_JOGO`  | RN-VOT-05    |
| Gerar ATA e aplicar o efeito                             | S                                          | na apuração                                      | RN-VOT-06/07 |
| Incluir ou excluir entrada do Anexo I                    | ninguém; S por ATA                         | —                                                | RN-BLO-02/04 |
| Editar ou apagar ATA, voto, sorteio, adesão ou auditoria | **ninguém**                                | trigger no banco                                 | RN-GER-03    |

### 3.8 Regulamento e ciclo

| Ação                                      | Quem                                        | Condições          | Regra     |
| ----------------------------------------- | ------------------------------------------- | ------------------ | --------- |
| Propor alteração                          | M, via votação `ALTERACAO_REGULAMENTO`      | uma aberta por vez | RN-REG-03 |
| Mudar parâmetros (valor, horário, prazos) | ninguém; S por ATA de alteração             | —                  | RN-REG-06 |
| Encerrar o consórcio                      | ninguém; S por ATA `CONTINUIDADE_CONSORCIO` | —                  | RN-CIC-10 |

## 4. Transcrição de atos do GRUPO (reserva, RN-GER-05)

| Ato transcrito                                                             | Por quem               | Evidência                   | Limite                                            | Efeito                                                                                           |
| -------------------------------------------------------------------------- | ---------------------- | --------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Não concorrer                                                              | qualquer M             | print + horário da mensagem | `registradaEm < corte`                            | igual ao ato próprio, marcado "transcrito por X"; o sujeito é avisado e pode revogar até o corte |
| Confirmação ou recusa de ciclo                                             | qualquer M             | idem                        | `efetivaEm` e `registradaEm` < `prazoConfirmacao` | idem; revogável pelo sujeito até o corte da 1ª rodada                                            |
| Justificativa de prorrogação                                               | qualquer M             | idem                        | `efetivaEm < vencimentoEm`; até +48 h             | prorroga                                                                                         |
| Pagamento                                                                  | qualquer M             | comprovante                 | —                                                 | nasce `DECLARADO` (não é transcrição, é registro, RN-FIN-04)                                     |
| **Impossibilidade, saída do consórcio, saída da família**                  | **não se transcrevem** | —                           | —                                                 | só o titular; senão, ATA `RECONHECER_IMPOSSIBILIDADE` ou `RECONHECER_SAIDA`                      |
| **Voto, aceite de Regulamento, aviso de compra, compra, aceite de cessão** | **não se transcrevem** | —                           | —                                                 | exigem o titular autenticado                                                                     |

A transcrição nunca reabre prazo nem altera um corte já executado.
