# 06 — Integração com a Steam

A Steam serve para três coisas:

1. **identidade**: login e vínculo com o SteamID64;
2. **cadastro automático**: nick, avatar, biblioteca de jogos e lista de desejos;
3. **validações do jogo do mês** (arts. 15 a 19): preço em BRL, compartilhável na família, conteúdo adulto, tipo, e se alguém já tem o jogo.

Fatos conferidos em 24/09/2026 (pesquisa técnica): endpoints testados com `curl` e documentação oficial. Os itens marcados **(verificar)** devem ser confirmados na implementação.

## 1. Resumo das fontes

| Dado                                                            | Endpoint                                                                                                                            | API key?                                     | Requisito do lado do membro                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| Login (SteamID64)                                               | OpenID 2.0 `https://steamcommunity.com/openid/login`                                                                                | não                                          | nenhum                                                  |
| Nick, avatar, URL, visibilidade                                 | `ISteamUser/GetPlayerSummaries/v2`                                                                                                  | **sim**                                      | nenhum (dados públicos)                                 |
| URL/vanity → SteamID64 (bootstrap)                              | `ISteamUser/ResolveVanityURL/v1`                                                                                                    | **sim**                                      | nenhum                                                  |
| Jogos que a pessoa possui                                       | `IPlayerService/GetOwnedGames/v1`                                                                                                   | **sim**                                      | **Detalhes dos jogos = Público**                        |
| Lista de desejos (com prioridade)                               | `IWishlistService/GetWishlist/v1`                                                                                                   | não                                          | lista pública (verificar se segue "Detalhes dos jogos") |
| Detalhes da loja (preço BRL, categorias, conteúdo adulto, tipo) | `store.steampowered.com/api/appdetails`                                                                                             | não (não oficial)                            | nenhum                                                  |
| Apps de um pacote (`/sub/<id>`)                                 | `store.steampowered.com/api/packagedetails?packageids=<id>&cc=br&l=brazilian` (verificar; usa `data.apps[].id`, `data.price.final`) | não (não oficial)                            | nenhum                                                  |
| Busca de jogo por nome                                          | `store.steampowered.com/api/storesearch/?term=…&cc=br&l=brazilian` (verificar)                                                      | não (não oficial)                            | nenhum                                                  |
| Composição da Família Steam                                     | `IFamilyGroupsService/*`                                                                                                            | **exige token de sessão do usuário (~24 h)** | **não usado** (RN-STM-12)                               |

`STEAM_API_KEY`: uma chave gratuita, de uma conta sem restrição (que já gastou pelo menos US$ 5), usada **só no servidor**. Limite: 100.000 chamadas por dia, muito acima do necessário.

## 2. Login com Steam (OpenID 2.0)

A Steam é provedora **OpenID 2.0**, não OIDC. Auth.js v5 (ainda beta) recusa provider OpenID 2.0, e os pacotes da comunidade são pouco mantidos ou incompatíveis com Next 16. **Decisão:** implementar à mão, em dois route handlers com cerca de 60 linhas, mais a sessão própria (RN-ACE-05).

```mermaid
sequenceDiagram
  participant U as Navegador
  participant A as App (Next)
  participant S as steamcommunity.com
  U->>A: GET /api/auth/steam
  A->>U: Set-Cookie steam_state=<rand>; 302 → S/openid/login?…&return_to=A/api/auth/steam/callback?state=<rand>
  U->>S: login + Steam Guard
  S->>U: 302 → return_to?openid.*
  U->>A: GET /api/auth/steam/callback?state&openid.*
  A->>A: valida state, mode, op_endpoint, return_to, claimed_id, nonce
  A->>S: POST /openid/login (openid.mode=check_authentication + openid.*)
  S-->>A: "ns:…\nis_valid:true"
  A->>A: SteamID64 na lista? cria Sessao
  A->>U: Set-Cookie sessao; 302 → /boas-vindas ou /
  A-->>A: after(): sincronizarPessoa(pessoaId)
```

- **RN-STM-01 — Validação do retorno.** Todos os itens abaixo são obrigatórios.
  1. **Mapa único de parâmetros.** Um mapa `openid.*` é montado a partir da query, e a requisição é recusada se alguma chave aparecer mais de uma vez. O `claimed_id` lido e o corpo do `check_authentication` saem **desse mesmo mapa**, o que evita a classe de ataque em que o RP lê um `claimed_id` e a Steam valida outro.
  2. **`state`.** Tem 32 bytes aleatórios em base64url e vai no cookie `steam_state` (`HttpOnly; Secure; SameSite=Lax; Path=/api/auth/steam; Max-Age=600`). `Lax` é obrigatório: com `Strict`, o cookie não volta no redirect vindo da Steam. O `state` da query precisa ser igual ao do cookie, e o cookie é apagado no callback, com sucesso ou com falha.
  3. `openid.ns === 'http://specs.openid.net/auth/2.0'` e `openid.mode === 'id_res'`.
  4. `openid.op_endpoint === 'https://steamcommunity.com/openid/login'`.
  5. `openid.return_to` é **exatamente** `APP_URL + '/api/auth/steam/callback?state=' + <state do cookie>`.
  6. `openid.claimed_id` casa com `^https?://steamcommunity\.com/openid/id/(\d{17})$` e `openid.identity === openid.claimed_id`.
  7. `openid.signed.split(',')` contém `op_endpoint`, `claimed_id`, `identity`, `return_to`, `response_nonce` e `assoc_handle` (OpenID 2.0 §10.1).
  8. **`openid.response_nonce`.** O timestamp prefixado tem no máximo 5 min e não pode estar mais de 1 min no futuro. O nonce **não pode** existir em `NonceOpenId` (o insert único faz o anti-replay; a Steam não garante invalidar a asserção reutilizada).
  9. **`check_authentication`.** O POST vai **sempre para a constante** `https://steamcommunity.com/openid/login`, nunca para um valor recebido. O corpo é form-urlencoded, com o mapa do item 1 e `openid.mode=check_authentication`. A resposta precisa ser HTTP 200 e é lida como linhas `chave:valor`; só vale se `is_valid` for **exatamente** `true`. Não precisa de API key.
  10. O SteamID64 extraído está na lista (RN-ACE-04).
  - **Falhas** de validação vão só para o log estruturado (`auth.falha`, sem PII) e mostram "Não foi possível entrar". O `EventoAuditoria` só registra `auth.nao_autorizado`: resposta válida com SteamID fora da lista, gravada com `atorTipo = SISTEMA`, `entidade = 'login'`, `entidadeId = steamId64`. Assim a trilha oficial não fica poluída por anônimos.
- **RN-STM-02 — Parâmetros do redirect:** `openid.ns=http://specs.openid.net/auth/2.0`, `openid.mode=checkid_setup`, `openid.return_to=<callback>`, `openid.realm=<APP_URL>`, `openid.identity` e `openid.claimed_id` = `http://specs.openid.net/auth/2.0/identifier_select`.
- **RN-STM-03 — Conversões:** `accountId (código de amigo) = BigInt(steamId64) − 76561197960265728n`; `steamId64 = 76561197960265728n + BigInt(codigoAmigo)`. Guarda-se o SteamID64 como `string` de 17 dígitos.

## 3. Sincronização de perfil, biblioteca e lista de desejos

- **RN-STM-04 — Quando sincroniza.**
  - No login, depois da resposta (`after()`), se a última sincronização tem mais de 6 h.
  - Diariamente no tick, para pessoas com `steamSincronizadoEm` acima de 24 h.
  - Manualmente pelo botão "Sincronizar com a Steam", recusado se `agora − steamSincronizadoEm < 10 min`.
  - Sincroniza pessoas com `Membro` não encerrado. Para integrantes que não são membros (`IntegranteFamilia` ATIVO com `steamId64`), sincroniza só o perfil e o `GetOwnedGames`, sem lista de desejos, para que os jogos deles apareçam na biblioteca da família.
- **RN-STM-05 — Perfil** (`GetPlayerSummaries`, até 100 ids por chamada). Atualiza `steamNick` (`personaname`), `steamAvatarUrl` (`avatarfull`), `steamPerfilUrl` (`profileurl`) e `steamPerfilPublico` (`communityvisibilitystate === 3`).
- **RN-STM-06 — Biblioteca** (`GetOwnedGames`, com `steamid`, `include_appinfo=1` e `include_played_free_games=1`).
  - Resposta `{"response":{}}` → `steamJogosPublicos = false`; a biblioteca **não** é apagada (mantém o último snapshot com a data).
  - Resposta com `games[]` → substitui o conjunto `JogoPossuido` da pessoa na mesma transação (é cache, então pode apagar) e enfileira em `SteamApp` os appIds desconhecidos, com `prioridadeSync = 1`.
  - Limitações: a lista inclui só jogos **próprios**, não os emprestados pela família; não inclui DLC.
- **RN-STM-07 — Lista de desejos** (`GetWishlist`, sem key; retorna `items[{appid, priority, date_added}]`).
  - Resposta `{"response":{}}` → privada ou vazia; `steamDesejosPublicos = false` se a biblioteca também for privada, senão "vazia".
  - O campo `priority` **não é um ranking único**: há zeros e repetidos. A ordem adotada é `priority > 0` crescente, depois `priority = 0` por `date_added` crescente. O resultado define `posicao` dos itens `STEAM`.
  - Substitui os itens `STEAM` e mantém os `MANUAL`, exibidos depois. `adicionadoEm = date_added`, usado em RN-COM-02.
  - Enfileira os appIds com `prioridadeSync = 2`.
  - O endpoint antigo `/wishlist/profiles/<id>/wishlistdata/` está **desativado** (redireciona para a home).

## 4. Detalhes de loja (`appdetails`)

- **RN-STM-08 — Chamada.** `GET https://store.steampowered.com/api/appdetails?appids=<id>&cc=br&l=brazilian`, **um appId por chamada**; vários appIds só funcionam com `filters=price_overview`, e sem esse filtro a API devolve 400.
  - Use `l=brazilian`, que devolve pt-BR ("Compartilhamento em família"). `l=portuguese` devolve pt-PT.
  - **Pegadinhas observadas:**
    - a chave do objeto de resposta pode **não** ser o appId pedido; ler `Object.values(json)[0]` e usar `data.steam_appid`;
    - appId inválido devolve `{ "<id>": { "success": false } }` com HTTP 200;
    - `required_age` vem às vezes como string, às vezes como número (`z.coerce.number()`);
    - jogos gratuitos não trazem `price_overview`;
    - `price_overview.initial` e `.final` já vêm em **centavos** (19990 = R$ 199,90);
    - a resposta tem `Cache-Control: max-age=3600`.
- **RN-STM-09 — Campos usados:** `type`, `name`, `is_free`, `price_overview{final, initial, discount_percent, currency}`, `categories[].id` (**62 = Family Sharing**), `content_descriptors.ids` (1 = alguma nudez ou conteúdo sexual; 2 = violência frequente; **3 = conteúdo sexual só para adultos**; 4 = nudez ou conteúdo sexual frequente; 5 = conteúdo adulto geral; mapeamento _provável_, verificar), `fullgame.appid` (DLC), `release_date.coming_soon`, `header_image`.
- **RN-STM-10 — Cache e limite de taxa.**
  - O limite não documentado é cerca de 200 requisições a cada 5 min por IP. Ao estourar, a API devolve 429 ou 403.
  - O tick processa **até 20** `SteamApp` por execução, em ordem de `prioridadeSync` desc e `detalhesEm` asc, com pelo menos 1,5 s entre chamadas.
  - Em 429/403, pausa global de 10 min, gravada em `Controle('steam_pausa').ate`.
  - Validade: detalhes, 7 dias; preço, 24 h para apps com prioridade ≥ 2.
  - No **aviso de compra**, o servidor faz chamadas síncronas para cada app do produto (principal, `fullgame` e incluídos) cujo cache tenha mais de 1 h, **até 10 chamadas por aviso**. O que passar disso usa o cache ou fica `DESCONHECIDO`. **Se a pausa estiver ativa**, o aviso não chama a API: usa o cache e, sem cache válido, as validações dependentes ficam `DESCONHECIDO` ("Steam em pausa até HH:MM").
- **RN-STM-11 — Falha nunca bloqueia sozinha.** Timeout (5 s), erro ou `success:false` → validações `DESCONHECIDO`, que pedem declaração e evidência (RN-COM-04). A tela diz "Dados da Steam indisponíveis agora".

## 5. Biblioteca da família (derivada)

- **RN-STM-12 — Sem `IFamilyGroupsService`.** Esses endpoints funcionam só com o _access token_ da sessão web do usuário (dura cerca de 24 h e é obtido da loja logada), não com a API key. Pedir esse token seria pedir uma credencial da conta. **Decisão:** a composição da família é registrada no sistema (RN-CAD-08/09), e a "biblioteca da família" é aproximada:
  - `bibliotecaFamilia = ⋃ JogoPossuido` de membros e integrantes com SteamID sincronizado, com join em `SteamApp`;
  - filtro "compartilhável": `62 ∈ categorias`. Categoria desconhecida → "verificando…";
  - por jogo: quem possui, total de cópias e horas jogadas por dono.
- **RN-STM-13 — Regras da Família Steam** (FAQ oficial). Exibidas na tela Família como informação:
  - até 6 membros;
  - 1 jogador por cópia; mais cópias permitem jogadores simultâneos;
  - **o dono não tem prioridade** sobre a cópia em uso (D-30);
  - não são compartilháveis: F2P e suas DLCs, jogos que exigem conta ou assinatura de terceiros, opt-out do publisher e jogos marcados como privados pelo dono;
  - trapaça pode tirar os privilégios de família do dono e gerar VAC;
  - cooldown de 1 ano para entrar em outra família.

## 6. Uso nas regras do jogo do mês

| Regra                               | Dado Steam                                                               | Onde                                |
| ----------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| RN-COM-01/02 lista e origem do jogo | `GetWishlist` + itens manuais                                            | lista, aviso                        |
| V1/V2 Anexo I                       | local + `fullgame.appid`, `appIdsIncluidos`                              | aviso, compra                       |
| V3/V4 conteúdo adulto               | `content_descriptors.ids`                                                | aviso                               |
| V6 compartilhável                   | `categories` contém 62                                                   | aviso                               |
| V7/V8 tipo e item virtual           | `type`, `is_free`, nome da DLC, `is_free` do jogo base                   | aviso                               |
| V9 o próprio contemplado já possui  | `GetOwnedGames` (contemplado)                                            | aviso                               |
| V10 outro membro possui             | `GetOwnedGames` (demais membros `ATIVO` ou `IMPOSSIBILITADO`, RN-COM-04) | aviso, compra                       |
| V12 pré-venda                       | `release_date.coming_soon`                                               | aviso                               |
| RN-COM-11 verificação pós-compra    | `GetOwnedGames` (contemplado)                                            | tick, até 7 dias depois da compra   |
| Preço de referência                 | `price_overview.final`                                                   | aviso (não substitui o comprovante) |

### Entrada do jogo no aviso

1. Colar o link da loja, o appId ou buscar por nome (storesearch, verificar). O link só é aceito se casar com `^https://store\.steampowered\.com/(app|sub|bundle)/(\d+)`, e serve **apenas para extrair o id**: o servidor nunca acessa a URL colada.
   - `app` → `JOGO` ou `DLC`, conforme o `type`.
   - `sub` → `PACOTE`: o `packagedetails` preenche `appIdsIncluidos`.
   - `bundle` → `PACOTE`: o contemplado informa os `appIdsIncluidos`, porque não há endpoint.
   - Em PACOTE, o `appId` é o app principal, escolhido pelo contemplado entre os incluídos.
2. O servidor atualiza o appdetails de cada app do produto (RN-STM-10), roda `validarProduto` e mostra o resultado por regra, com o artigo.
   - V3 e V6 são avaliadas em cada app incluído (prevalece o pior resultado); V7, só no app principal; V1, em todos.
   - V9 e V10 usam o cache `JogoPossuido`, mostram `steamSincronizadoEm` e ignoram quem está com `steamJogosPublicos = false`. Para DLC, V9 dá `DESCONHECIDO` e V10 dá ALERTA "não verificável", porque GetOwnedGames não lista DLC.
3. Para chave de outra loja, o appId continua obrigatório, porque é o app que a chave ativa na Steam.

## 7. Orientação ao membro (tela "Minha conta Steam")

Estado exibido: perfil público ✅/❌, detalhes de jogos públicos ✅/❌, lista de desejos visível ✅/❌, última sincronização.

Com algo privado, mostrar o passo a passo: **Steam → Perfil → Editar perfil → Configurações de privacidade → "Detalhes dos jogos: Público"**. Informar o que deixa de funcionar: a biblioteca não aparece para a família; as checagens V9 e V10 ficam "não verificáveis" para essa pessoa, o que pede declaração manual; a verificação pós-compra exige print.

## 8. Contratos (zod, resumo)

```ts
// src/server/steam/schemas.ts
export const appDetailsSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      steam_appid: z.number(),
      type: z.string(),
      name: z.string(),
      is_free: z.boolean(),
      required_age: z.coerce.number().optional(),
      price_overview: z
        .object({
          currency: z.string(),
          initial: z.number(),
          final: z.number(),
          discount_percent: z.number(),
        })
        .optional(),
      categories: z.array(z.object({ id: z.number(), description: z.string() })).optional(),
      content_descriptors: z
        .object({ ids: z.array(z.number()).nullable(), notes: z.string().nullable() })
        .optional(),
      fullgame: z.object({ appid: z.coerce.number(), name: z.string() }).optional(),
      release_date: z.object({ coming_soon: z.boolean(), date: z.string() }).optional(),
      header_image: z.string().url().optional(),
    })
    .optional(),
})

export const ownedGamesSchema = z.object({
  response: z.object({
    game_count: z.number().optional(),
    games: z
      .array(
        z.object({ appid: z.number(), name: z.string().optional(), playtime_forever: z.number() }),
      )
      .optional(),
  }),
})

export const wishlistSchema = z.object({
  response: z.object({
    items: z
      .array(z.object({ appid: z.number(), priority: z.number(), date_added: z.number() }))
      .optional(),
  }),
})
```

Toda chamada usa o `fetch` injetado em `src/server/steam/api.ts` (os testes usam fixtures JSON), com `AbortSignal.timeout(5000)`. A resposta é validada com o schema, e o log registra só endpoint, latência e status. **Nunca** vão para o log a URL (que contém `key=`), o erro bruto do fetch ou payload com PII.
