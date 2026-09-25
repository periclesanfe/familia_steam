# 15 — Famílias, acesso aberto e informação de jogos (M10)

Decisão do usuário em 25/09/2026 (D-33 a D-36, doc 03). Este documento **substitui** a RN-ACE-04 ("entra só quem está na lista") e o bootstrap por operador (RN-ACE-10) como porta de entrada. O restante da spec continua valendo **dentro de cada família**.

## 1. Visão

- Qualquer conta Steam entra no sistema e tem uma **área pessoal**: meus jogos, minha lista de desejos e meus amigos Steam.
- Existem **várias famílias**, cada uma espelhando uma Família Steam e com o **próprio consórcio**: Regulamento e versões, ciclos, rodadas, obrigações, votações, ATAs, Anexo I e auditoria. As famílias são **isoladas**: ninguém vê nada de outra família.
- Cada pessoa está em **no máximo uma família por vez**. Pode sair e entrar em outra. Quem está numa família não cria outra.
- Não existe administrador (RN-ACE-02). Quem cria a família não tem poder algum além de ser o primeiro membro.

## 2. Regras (RN-FAM)

- **RN-FAM-01 — Visitante.** Todo login Steam válido (06 §2) cria ou atualiza a `Pessoa` pelo `steamId64` (nick, avatar e perfil vêm da Steam). Quem não tem vínculo aberto com uma família tem o perfil **`VISITANTE`**: vê só a própria área pessoal, a página pública dos jogos e os convites dirigidos à sua conta Steam.
- **RN-FAM-02 — Criar família.** Um `VISITANTE` cria uma família informando o nome. Na mesma transação:
  - nasce a `Familia`;
  - nasce a versão 1.0 do Regulamento **da família**, a partir de `docs/regulamento/regulamento-v1.0.md`, com os parâmetros padrão (RN-REG-06) e a entrada 01 do Anexo I (RN-BLO-01);
  - o criador vira `Membro` `FUNDADOR` `AGUARDANDO_ADESAO` e `IntegranteFamilia` (origem `PRE_EXISTENTE`, com a data em que entrou na Família Steam informada por ele).
- **RN-FAM-03 — Uma família por vez.** No máximo um `Membro` não encerrado por pessoa (RN-CAD-03, já existente) e no máximo um `IntegranteFamilia` `ATIVO`/`CONVITE_AUTORIZADO` por pessoa. Criar ou aceitar convite com vínculo aberto é recusado.
- **RN-FAM-04 — Indicação.** Qualquer membro indica um candidato:
  - escolhendo entre os **próprios amigos Steam** (`GetFriendList`), ou colando o **link do perfil** (`/profiles/<id>` ou `/id/<vanity>`, resolvido por `ResolveVanityURL`);
  - opcionalmente com o **e-mail** do candidato, só para o envio do convite.
  - A tela da indicação mostra o perfil do candidato, a biblioteca dele (se pública) e **quantos jogos compartilháveis ele acrescentaria** à biblioteca da família (jogos dele que nenhum integrante possui).
  - Candidato já em outra família pode ser indicado; ele só aceita depois de sair da atual (RN-FAM-03).
- **RN-FAM-05 — Aprovação da indicação.**
  - **Antes da vigência** do Regulamento da família: decide o **organizador** (RN-FAM-10). A indicação feita por ele já vira convite; as dos demais esperam a resposta dele. Os outros membros podem registrar a opinião, que aparece para todos mas não decide. Sem decisão em 7 dias, a indicação caduca.
  - **Depois da vigência:** vale o Regulamento. A indicação abre a votação `ADMISSAO_MEMBRO` (art. 6º, com `incluirNaFamilia`) ou `CONVITE_INTEGRANTE` (art. 7º), com o quórum da versão vigente. Não há mais organizador.
- **RN-FAM-06 — Link de convite.** Aprovada a indicação, nasce um `Convite` com token aleatório, **amarrado ao `steamId64` do candidato** (o token fica gravado para qualquer membro reabrir o link; ele não serve a outra conta Steam), de uso único e válido por 14 dias.
  - O sistema não envia e-mail: a tela oferece o link para copiar e um `mailto:` pronto (assunto e corpo) para o e-mail informado. _ponytail:_ envio automático entra se houver provedor de e-mail.
  - Ao abrir o link, o candidato entra com a Steam. Se o `steamId64` for outro, o convite é recusado sem revelar a família.
  - Aceito: antes da vigência, vira `Membro` `FUNDADOR` `AGUARDANDO_ADESAO`; depois, segue a RN-CAD-12 (`AGUARDANDO_ADESAO` → assina → `AGUARDANDO_CICLO`). O `IntegranteFamilia` nasce `ATIVO` se ele declarar que já está na Família Steam (com a data), ou `CONVITE_AUTORIZADO` para registrar a execução depois (RN-CAD-08).
- **RN-FAM-07 — Vigência do acordo.** Substitui a RN-REG-01 quanto ao gatilho: a 1.0 da família entra em vigor quando **todos** os membros não encerrados da família assinaram e são **pelo menos 2**. `vigenteDesde` = instante da última assinatura. Na mesma transação nasce o ciclo 1 (RN-CIC-01). Quem não quiser participar sai da família (RN-FAM-08); não há "membro que não assina".
- **RN-FAM-08 — Sair da família.** Antes da vigência: o vínculo encerra sem efeitos de consórcio e as indicações abertas dele caducam. Depois: RN-CAD-10 (saída da família, com saída do consórcio e bloqueio de vaga). Em ambos os casos a pessoa volta a `VISITANTE` (ou `EX_*`, se tiver pendência no consórcio daquela família) e pode aceitar convite de outra.
- **RN-FAM-09 — Ex-membro com pendência.** Quem saiu de uma família com pendências continua vendo, daquela família, só o que a RN-ACE-07/08 permite ao `EX_COM_PENDENCIA`. Se entrar em outra família, o perfil é o da família atual, e o `/financeiro/extrato` mostra as pendências da anterior.

- **RN-FAM-10 — Organizador antes da vigência** (D-37). Quem criou a família é o **organizador** enquanto o acordo não está em vigor: aprova ou recusa as entradas (RN-FAM-05) e exclui qualquer membro, sem efeitos de consórcio (o vínculo encerra, a indicação dele é cancelada e, se os que ficam já assinaram, a 1.0 entra em vigor). **No instante em que todos assinam e o acordo entra em vigor, o papel acaba**: dali em diante ninguém tem poder acima dos outros (RN-ACE-02) e entradas e exclusões seguem o Regulamento, por votação.

## 3. Modelo de dados

- **Novas tabelas:**
  - `Familia(id, nome, criadaPorId, criadaEm)`.
  - `Indicacao(id, familiaId, candidatoSteamId64, indicadaPorId, email?, status: ABERTA|APROVADA|RECUSADA|CADUCOU|CANCELADA, criadaEm, encerradaEm, votacaoId?)` e `AprovacaoIndicacao(indicacaoId, pessoaId, aprova, em)`: aprovação unânime antes da vigência.
  - `Convite(id, familiaId, indicacaoId, steamId64, token, expiraEm, usadoEm?, usadoPorId?)`.
  - `AmizadeSteam(pessoaId, amigoSteamId64, desde)`: cache da lista de amigos (RN-STM-04, mesma validade de 24 h).
- **`familiaId`** (obrigatório) em: `VersaoRegulamento`, `JogoBloqueado`, `Membro`, `IntegranteFamilia`, `Ciclo`, `Rodada`, `Obrigacao`, `Votacao`, `Ata`, `Declaracao`, `Cessao`, `AvisoCompra`, `Aquisicao`, `Anexo`, `EventoAuditoria` (nulo nos eventos pessoais: login, lista de desejos). As demais herdam pela relação (pagamento → obrigação; voto → votação; sorteio → rodada).
- **Unicidade por família:** `VersaoRegulamento(familiaId, ordem)`, `(familiaId, numero)`; `Ata(familiaId, numero)`; `Ciclo(familiaId, numero)`; `JogoBloqueado(familiaId, numero)`; votação aberta única por `(familiaId, assunto, chaveObjeto)`.
- **Locks:** `'fechamento'`, `'ata'` e `'regulamento'` passam a `'<chave>:<familiaId>'`. A ordem continua: `fechamento:*` sempre primeiro.
- **Dados Steam compartilhados:** `SteamApp`, `JogoPossuido`, `ItemListaDesejos` e o histórico de preços são **globais** (dados da Steam, não do consórcio). O que cada família vê deles é filtrado pelos seus integrantes.
- **Migração dos dados existentes:** uma família "Família Steam" recebe todos os registros atuais (ambiente de desenvolvimento; não há produção).

## 4. Isolamento (SEG-13, novo)

- O guard devolve `{ pessoaId, perfil, familiaId }`. Toda consulta e todo serviço do consórcio recebem `familiaId` do guard, **nunca do formulário**; ids vindos do formulário são conferidos contra `familiaId` (um id de outra família é `NAO_ENCONTRADO`, sem revelar que existe).
- Teste de isolamento por rota e por action: dois grupos de dados em famílias diferentes; toda página e toda action com id da outra família dá 404/`NAO_ENCONTRADO` (CA-181).
- Anexos: o download confere a família do anexo.
- O tick percorre as famílias; cada passo continua uma transação curta, agora por família.
- **Implementação (defesa em profundidade):** Row-Level Security no Postgres. As tabelas do consórcio têm `familiaId` com default `current_setting('app.familia_id')` e a política `familiaId = app.familia_id`; o `app_rw` não tem `BYPASSRLS`. O app define a variável em toda transação (`emTransacao`) e em toda consulta avulsa (lote `[set_config, consulta]` na extensão do Prisma). A família vem de `comFamilia()` (actions, tick, rotas) ou do guard da página (cache da requisição). Sem família definida, as tabelas do consórcio aparecem vazias. `Convite`, `Familia` e os dados Steam são globais.

## 5. Informação de jogos e listas (M10b)

- **Por app** (`appdetails` + endpoints públicos), guardados em `SteamApp`:
  - capa (`header_image`), cápsula, fundo e até 8 capturas em pares miniatura/tamanho cheio (URLs dos CDNs da Steam; se uma das duas não for do CDN, o par sai inteiro, SEG-04). A página do jogo mostra a galeria para qualquer perfil, porque a lista de desejos pessoal aponta para ela;
  - gêneros, categorias, desenvolvedoras, publicadoras, data de lançamento, Metacritic, idade mínima;
  - suporte a controle, plataformas, idiomas;
  - descrição curta **em texto** (o HTML é descartado, SEG-04);
  - resumo de avaliações (`appreviews`, todos os idiomas, sem key: `review_score` 0–9 exibido com os termos da Steam em pt-BR, % positivas, total), buscado junto com o `appdetails`; falha comum mantém o anterior, 429/403 pausa (RN-STM-10);
  - jogadores agora (`GetNumberOfCurrentPlayers`, atualizado com o preço).
- **Histórico de preço próprio:** `PrecoApp(appId, em, precoCentavos, descontoPct)` gravado quando o preço muda. A Steam não expõe histórico; o gráfico mostra o que o sistema observou.
- **Lista de desejos:**
  - capa, preço, desconto e menor preço já observado;
  - avaliações e data de inclusão;
  - quem da família já possui o jogo e quem mais o deseja;
  - filtros (em promoção, compartilhável, abaixo de R$ X).
- **Biblioteca da família:** grade de capas com dono(s), horas jogadas e selo de compartilhável.

## 6. Calendário de promoções (M10c)

- `EventoPromocao(id, nome, inicio, fim, fonteUrl, criadoPorId)`: tabela **global**, sem `familiaId` (as grandes promoções da Steam valem para todas as famílias). Quem está numa família (MEMBRO ou PENDENTE) cadastra, com auditoria na própria família; só quem cadastrou remove (para corrigir, remove e cadastra de novo). A Steam não publica esse calendário por API; a Valve anuncia as datas na documentação do Steamworks, a tela aponta para lá e pede o link `https` da fonte.
- **Janelas de compra:** os próximos 6 sorteios são projetados pelo `diaSorteio` da versão aplicável, e cada janela vai do sorteio até `diasPrazoCompra` dias depois (art. 20). Um evento que cruza a janela marca o sorteio como "bom momento"; se já estiver acontecendo no dia do sorteio, a tela diz isso.
- **Em promoção agora:** itens das listas de desejos da família com desconto > 0 no último preço observado, ordenados por desconto.
- A tela do calendário mostra, na mesma linha do tempo, os próximos sorteios da família e os eventos de promoção. Mudar o dia do sorteio continua sendo alteração do Regulamento (`diaSorteio`, RN-REG-06).

## 7. Cenários (CA-180 em diante)

| CA  | Dado / Quando                                                                                                           | Então                                                                      | Regras    | Nível |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- | ----- |
| 180 | Conta Steam desconhecida faz login                                                                                      | vira `VISITANTE` com área pessoal; não vê nenhuma família                  | FAM-01    | I/E   |
| 181 | Membro da família A pede página, anexo ou action com id da família B                                                    | 404 / `NAO_ENCONTRADO`                                                     | SEG-13    | I     |
| 182 | Membro da família A tenta criar outra família / aceitar convite de B                                                    | recusado (`ENTRADA_INVALIDA`)                                              | FAM-03    | I     |
| 183 | Indicação antes da vigência com 3 membros: 2 aprovam, 1 recusa                                                          | indicação `RECUSADA`; nenhum convite                                       | FAM-05    | I     |
| 184 | Indicação aprovada por todos; o link é aberto por outra conta Steam                                                     | recusado sem revelar a família; o convite continua válido para o candidato | FAM-06    | I     |
| 185 | Convite usado duas vezes / depois de 14 dias                                                                            | recusado                                                                   | FAM-06    | I     |
| 186 | 3 membros; 2 assinaram; o 3º sai da família                                                                             | a 1.0 entra em vigor com os 2 (todos os restantes assinaram)               | FAM-07/08 | I     |
| 187 | Família de 1 membro que assinou                                                                                         | a 1.0 **não** entra em vigor (mínimo 2)                                    | FAM-07    | I     |
| 188 | Depois da vigência, indicação                                                                                           | abre `ADMISSAO_MEMBRO` com o quórum da versão vigente                      | FAM-05    | I     |
| 189 | Duas famílias com ATA nº 1 e ciclo 1 cada                                                                               | numeração independente; locks não se bloqueiam entre famílias              | SEG-13    | I     |
| 190 | Indicação de amigo Steam com biblioteca pública                                                                         | a tela mostra quantos jogos compartilháveis ele acrescenta                 | FAM-04    | I     |
| 191 | Preço de um app muda 3 vezes                                                                                            | 3 linhas de `PrecoApp`; o menor aparece na lista de desejos                | §5        | I     |
| 193 | Organizador exclui um membro antes da vigência; outro membro tenta excluir; após a vigência o organizador tenta excluir | exclui / `SEM_PERMISSAO` / `SEM_PERMISSAO`                                 | FAM-10    | I     |
| 192 | Evento de promoção global cadastrado por membro de A                                                                    | aparece para a família B; a edição fica na auditoria                       | §6        | I     |
