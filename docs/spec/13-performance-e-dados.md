# 13 — Performance e acesso a dados

O sistema tem 5 usuários, e a performance nunca vai ser um problema de volume. Os riscos reais são outros: **N+1** escondido na árvore de componentes, cascatas de `await`, transações longas segurando lock, chamadas à Steam no caminho da requisição e pool de conexões esgotado. Este documento fixa as regras (`DP-nn`) que evitam esses problemas **por construção** e o teste que as prova.

Base verificada em 25/09/2026, com Prisma 7.10.0 + `@prisma/adapter-pg` sobre Postgres 17 (experimento local registrado na pesquisa) e a documentação do Next 16.3.6.

## 1. Volume esperado

| Tabela                                          | Linhas/ano (estimativa)  | Observação                                |
| ----------------------------------------------- | ------------------------ | ----------------------------------------- |
| `Pessoa`, `Membro`, `IntegranteFamilia`         | < 20                     | —                                         |
| `Rodada`, `Sorteio`, `AvisoCompra`, `Aquisicao` | ~12–30                   | uma rodada por mês                        |
| `Obrigacao`, `Pagamento`                        | ~100–200                 | ~5 por rodada, mais cessões e devoluções  |
| `Votacao`, `Voto`, `Ata`                        | ~20 / ~100 / ~20         | —                                         |
| `EventoAuditoria`                               | ~3.000–10.000            | **a maior tabela escrita pelo app**       |
| `SteamApp`                                      | ~2.000–5.000 (acumulado) | bibliotecas + listas de desejos           |
| `JogoPossuido` / `ItemListaDesejos`             | ~2.000–4.000 / ~500      | trocados por inteiro a cada sincronização |
| `Anexo`                                         | ~150 (≤ 200 MB)          | `bytea` (ADR-005)                         |

Conclusões:

- Seq Scan em tabela de algumas centenas de linhas é **o plano certo**. Não se otimiza isso.
- Só crescem de verdade a auditoria, o catálogo da Steam e as posses. As listagens delas são as únicas que precisam de índice pensado e paginação.

## 2. Regras de consulta

### DP-01 — Proibido `await` de banco dentro de laço

- Nada de `for (…) { await db.x.findMany(…) }` e nada de `Promise.all(ids.map((id) => db.x.findMany({ where: { yId: id } })))`: isso é N+1, mesmo em paralelo, porque o Prisma **não** agrupa `findMany`.
- Para relações: `include`/`select` aninhado (**uma consulta por nível** de relação, nunca por linha). Para listas de IDs: `where: { id: { in: ids } }`.
- **Não depender** do agrupamento automático de `findUnique` feitos no mesmo tick (o _dataloader_ do Prisma). Ele funciona, mas é frágil: basta um `select` diferente para quebrar.
- `relationLoadStrategy: 'join'` (preview `relationJoins`) **fica desligado** na v1. É Preview, e `include` já garante uma consulta por nível.
- **Checagem automática:** `no-await-in-loop: 'error'` no ESLint para `src/features/**` e `src/server/**`. A exceção legítima é o `tick` e o fechamento em cadeia, que **precisam** ser sequenciais (cada passo é uma transação própria, em ordem, RN-FIN-13). Ali vai `// eslint-disable-next-line no-await-in-loop -- sequencial por regra (RN-FIN-13)`.

### DP-02 — Uma página, um carregamento; componentes filhos não consultam

- Cada `page.tsx` chama **uma** função de `consultas.ts` (ou poucas, independentes, em `Promise.all`) e passa os dados por props.
- **Componente de linha nunca consulta o banco.** Um `<LinhaObrigacao>` que chamasse `await obterPessoa(id)` seria N+1 pela árvore de componentes, invisível no código da página.
- A exceção são blocos independentes e lentos (dado da Steam), que ficam num `<Suspense>` próprio e fazem **uma** consulta cada, no nível da página, nunca por item.

### DP-03 — O "retrato" do ciclo alimenta o domínio

O painel de pendências (`pendenciasDe`), o perfil (`perfilDe`), a grade do ciclo e as validações do aviso dependem de muito estado cruzado. Em vez de cada regra buscar o que precisa, **um carregador monta o retrato uma vez** e o domínio puro calcula sobre ele:

```ts
// src/features/ciclos/consultas.ts
export const carregarRetratoDoCiclo = cache(async (cicloId: string) => {
  const [ciclo, rodadas, obrigacoes, declaracoes, votacoesAbertas] = await Promise.all([
    db.ciclo.findUniqueOrThrow({ where: { id: cicloId }, include: { participacoes: true } }),
    db.rodada.findMany({
      where: { cicloId },
      include: { sorteio: true, avisos: true, aquisicoes: true, cessoes: true },
    }),
    db.obrigacao.findMany({ where: { rodada: { cicloId } }, include: { pagamentos: true } }),
    db.declaracao.findMany({ where: { OR: [{ cicloId }, { rodada: { cicloId } }] } }),
    db.votacao.findMany({ where: { status: 'ABERTA' }, include: { votos: true } }),
  ])
  return { ciclo, rodadas, obrigacoes, declaracoes, votacoesAbertas } // tipo RetratoCiclo
})
```

- O número de consultas é **fixo** (aqui, em torno de 10 com os níveis de `include`), seja qual for o número de rodadas ou pagamentos.
- O retrato é limitado por natureza: um ciclo tem no máximo ~12 rodadas e 6 participantes. Calcular em memória sobre ele é mais barato e mais testável do que agregações em SQL espalhadas.
- As funções de domínio recebem o retrato e `agora`, e continuam puras (os testes unitários montam o retrato à mão).

### DP-04 — `select` explícito e DTO mínimo nas consultas

- `consultas.ts` devolve **DTOs**: só os campos que a tela usa, sem a linha crua do Prisma. Isso reduz o payload RSC e é também uma regra de segurança ([14](14-seguranca.md), SEG-06).
- **Bytes nunca vazam por acidente:** `omit` global no `PrismaClient` para `Anexo.conteudo`. Só a rota de download pede o campo, explicitamente (`omit: { conteudo: false }`).

  ```ts
  new PrismaClient({ adapter, omit: { anexo: { conteudo: true } } })
  ```

- Contagens: `_count` na própria consulta ou `groupBy`. Nada de carregar a lista para fazer `.length`.

### DP-05 — Agregação no banco quando o conjunto cresce

- Para o que é ilimitado no tempo (matriz devedor × credor de **todos** os ciclos, totais do extrato de toda a história, contadores da biblioteca), use `groupBy`/`_sum`/`_count` no Postgres.
- Para o que é limitado (um ciclo, uma rodada), use o retrato + domínio (DP-03).
- **A regra de conservação RN-FIN-18** é calculada pelo domínio sobre o retrato. É invariante de negócio, e uma versão SQL paralela só criaria duas verdades.

### DP-06 — Sessão e perfil uma vez por requisição

- `obterSessao()` e `perfilDe(pessoaId)` são envolvidos em `React.cache`, **definidos no nível do módulo** e com argumentos primitivos (o cache compara com `Object.is`). Layout, página e componentes que precisarem chamam à vontade: uma consulta por requisição.
- `React.cache` só vale em Server Components. Em Server Actions, `acao()` resolve sessão e perfil **uma vez** e os passa no `ctx` ([08 §4.1](08-arquitetura-e-qualidade.md#41-server-action-fina-e-sempre-igual)).

### DP-07 — Sem cascata de `await`

- Leituras independentes da mesma página começam juntas: `const [a, b] = await Promise.all([lerA(), lerB()])`.
- Leitura que depende de outra (primeiro o ciclo atual, depois o retrato dele) é cascata legítima, com no máximo 2 níveis por página.
- Layout e página já renderizam em paralelo no Next. O guard do layout do `(app)` lê só a sessão (em cache, DP-06).

## 3. Transações, locks e conexões

### DP-08 — Transação curta, só com banco

- Dentro de `emTransacao`, **só** Postgres: nada de `fetch` (Steam), leitura de arquivo pesada ou `after()`. Dados externos são buscados antes; a gravação vem depois.
- Limites padrão do Prisma mantidos: `maxWait` 2 s e `timeout` 5 s. O estouro (`P2028`) vira `ErroDeNegocio('OCUPADO', 'O sistema está ocupado. Tente de novo em instantes.')`.
- Ordem fixa dos advisory locks (RN-GER-06): `'fechamento'` sempre primeiro, depois `rodada:`, `votacao:` e `ata`. A ordem fixa impede deadlock entre transações.
- Isolamento `READ COMMITTED` (padrão do Postgres). A correção vem dos locks + constraints únicas + releitura dentro da transação, não de `SERIALIZABLE`.

### DP-09 — Pool e timeouts do lado do banco

`src/server/db.ts` passa a configurar:

```ts
new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 5, // 5 usuários; o Postgres do compose aceita 30
  connectionTimeoutMillis: 5_000, // o padrão (0) espera para sempre por uma conexão
  statement_timeout: 10_000, // nenhuma consulta legítima daqui passa de 10 s
  idle_in_transaction_session_timeout: 15_000, // transação esquecida não segura lock
})
```

- Singleton em `globalThis` fora de produção (já implementado), para o HMR não abrir um pool por recarga.
- O `migrate` roda com a própria conexão (CLI), fora desse pool.
- _ponytail:_ sem PgBouncer. Uma instância e 5 conexões não justificam.

## 4. Renderização e cache (Next 16)

### DP-10 — Tudo dinâmico, sem Cache Components

- Quase toda página lê o cookie de sessão, e portanto é dinâmica. **`cacheComponents` fica desligado:** o ganho seria pequeno e as regras (Suspense obrigatório em volta de dado não cacheado, `<Activity>` preservando estado de formulários entre navegações) custariam caro.
- Nada de `'use cache'` na v1. O `fetch` do Next não é cacheado por padrão, e nem precisa: a Steam é lida pelo job e gravada no banco (DP-13).

### DP-11 — Depois da mutação: `revalidatePath('/', 'layout')`

- `acao()` chama `revalidatePath('/', 'layout')` depois de toda mutação bem-sucedida. É uma regra única, sem lista de caminhos por action para esquecer de atualizar. Como nada é cacheado no servidor (DP-10), o custo é só o cliente buscar de novo o payload da rota atual, **no mesmo roundtrip** da action.
- Com `redirect`, chamar `revalidatePath` **antes** (o `redirect` lança exceção).
- _ponytail:_ invalidação global. Se um dia houver cache de verdade, trocar por `updateTag` por entidade.

### DP-12 — Streaming e JavaScript no cliente

- `loading.tsx` por segmento, conforme o [12 §6](12-design-e-interface.md#6-estados-de-tela). `<Suspense>` em volta dos blocos da Steam.
- **Server Components por padrão.** Ficam no servidor, sem JS no cliente:
  - `Markdown` (`react-markdown` renderiza no servidor);
  - `Dinheiro` e `DataHora` (formatação por `Intl`);
  - tabelas, grades e o painel.
- No cliente ficam só as ilhas: formulários, `ConfirmarAcao`, `Prazo`, copiar texto, reordenar a lista de desejos e o shell (`Sidebar`).
- Sem bibliotecas pesadas no cliente: nada de biblioteca de animação, de tabela ou de datas no bundle do navegador (o `date-fns` fica no servidor e no domínio).
- `Promise.all` de **Server Actions** no cliente não paraleliza, porque o Next despacha uma por vez. Trabalho paralelo vai dentro de uma única action.
- Imagens da Steam: `images.unoptimized` (já configurado). Elas já vêm em JPEG pequeno, de CDN com cache de ~10 anos. Sempre com `width`/`height` e `loading="lazy"` (sem salto de layout).
- Fontes: `next/font` auto-hospeda a Geist (sem requisição a terceiros e com `font-display: swap`).

## 5. Steam

### DP-13 — A Steam nunca está no caminho da página

- Páginas leem **só o banco**. Sincronizações rodam no `tick` (08 §7) ou em `after()` depois do login e do botão "Sincronizar" (a resposta volta na hora, e a sincronização segue depois).
- **Em lote:**
  - `GetPlayerSummaries` aceita até 100 SteamIDs por chamada, então os 5 perfis saem numa só;
  - `GetOwnedGames` e `GetWishlist` são por pessoa (5 chamadas cada);
  - `appdetails` é um app por chamada, no máximo 20 por tick (RN-STM-10), com a pausa global em 429/403.
- **Gravação em bloco**, numa transação curta, depois das chamadas: `deleteMany` + `createMany` para posses e lista de desejos da pessoa, e `createMany({ skipDuplicates: true })` para `SteamApp` novos. Nada de `upsert` por jogo dentro de laço.
- Timeout de 5 s por chamada (06 §8). Uma pessoa com falha não interrompe as outras (`Promise.allSettled`).

## 6. Índices e paginação

### DP-14 — Índice por consulta real, não por reflexo

- O Postgres **não cria índice em coluna de FK**, e o Prisma também não. Mesmo assim, a regra aqui **não** é indexar toda FK: com o volume do §1, índice em tabela de centenas de linhas só custa escrita e espaço.
- Índices que já existem no schema, com o porquê:

| Tabela              | Índice                                          | Consulta que atende                                |
| ------------------- | ----------------------------------------------- | -------------------------------------------------- |
| `EventoAuditoria`   | `(entidade, entidadeId)`, `(ocorridoEm)`        | linha do tempo de uma entidade; filtro por período |
| `EventoAuditoria`   | PK `id` (Int)                                   | paginação por cursor (DP-15)                       |
| `JogoPossuido`      | PK `(pessoaId, appId)` + `(appId)`              | biblioteca da pessoa; "quem tem este jogo"         |
| `ItemListaDesejos`  | único `(pessoaId, origem, appId)`               | lista da pessoa ("quem deseja" varre ~500 linhas)  |
| `SteamApp`          | `(prioridadeSync, detalhesEm)`                  | fila do tick                                       |
| `Obrigacao`         | `(devedorId)`, `(credorId)`, `(rodadaId, tipo)` | extrato e matriz                                   |
| `Rodada`, `Votacao` | `(status, agendadaPara)`, `(status, encerraEm)` | o tick                                             |

- As demais FKs sem índice (lista gerada do schema em 25/09/2026: `Rodada.cicloId`, `Cessao.rodadaId`, `Voto.pessoaId` e outras 20) ficam assim de propósito. **Gatilho para revisar:** tabela com mais de 10 mil linhas ou consulta acima de 50 ms no log (DP-16). A verificação é `EXPLAIN (ANALYZE, BUFFERS)`, dentro de `BEGIN … ROLLBACK` quando for DML.

### DP-15 — Paginação por cursor na auditoria

- `/auditoria` pagina por cursor: `where: { id: { lt: cursor } }, orderBy: { id: 'desc' }, take: 50`, com "Mais antigos" e "Mais recentes" na URL (`?antes=`/`?depois=`). Sem `OFFSET` e sem `count(*)` da tabela inteira.
- As demais listas são pequenas (§1) e não paginam: a lista de obrigações de um ciclo cabe numa tela.

## 7. Medição

### DP-16 — Contador de consultas e teste de N+1

- **Log em dev:** com `DEBUG_SQL=1`, o client usa `log: [{ emit: 'event', level: 'query' }]` e imprime consulta e duração. O `$on('query')` precisa ser registrado **antes** de qualquer `$extends` (o client estendido não tem `$on`).
- **Helper de teste** (`tests/integracao/consultas.ts`): `contarConsultas(fn)` zera um contador alimentado por `$on('query')`, executa `fn` e devolve o total, descontando `BEGIN`/`COMMIT`.
- **O teste de N+1 é de constância, não de número mágico:** cada consulta de página roda com a fábrica criando N itens e depois 3N itens, e **o número de consultas tem que ser o mesmo**. Isso pega N+1 de qualquer origem sem amarrar o teste a um valor exato.

  ```ts
  it('extrato não cresce com o nº de pagamentos (DP-02)', async () => {
    const poucos = await contarConsultas(() => extratoDe(pessoaA, { pagamentos: 2 }))
    const muitos = await contarConsultas(() => extratoDe(pessoaB, { pagamentos: 6 }))
    expect(muitos).toBe(poucos)
  })
  ```

- Orçamento **indicativo** por tela, anotado no próprio teste e revisto quando medido: Painel ≤ 12, Rodada ≤ 12, Grade do ciclo ≤ 10, Financeiro ≤ 6, Votação ≤ 6, Biblioteca ≤ 4, Auditoria ≤ 3.
- `pg_stat_statements` fica desligado. _ponytail:_ ligar (`shared_preload_libraries` + `CREATE EXTENSION`) só se aparecer lentidão real em produção.

## 8. Checklist de revisão (PR)

- [ ] Nenhum `await` de banco em laço ou `map` (DP-01); exceções com `eslint-disable` justificado.
- [ ] Componentes filhos recebem dados por props (DP-02).
- [ ] `consultas.ts` com `select` e DTO; nada de `Bytes` (DP-04).
- [ ] Nenhum `fetch` dentro de `emTransacao` (DP-08).
- [ ] Nova listagem que cresce com o tempo tem índice e paginação (DP-14/15).
- [ ] Teste de constância de consultas para consulta nova de página (DP-16).

## 9. Onde isso entra no plano

| Item                                                                                          | Marco |
| --------------------------------------------------------------------------------------------- | ----- |
| `db.ts` com timeouts e `omit` (DP-04/09); `no-await-in-loop`; `contarConsultas` e `DEBUG_SQL` | M1    |
| `emTransacao` com tradução de `P2028`; `acao()` com `revalidatePath('/', 'layout')`           | M1    |
| Sincronização em lote e `after()` (DP-13)                                                     | M2/M3 |
| `carregarRetratoDoCiclo` (DP-03) e testes de constância das telas                             | M4/M5 |
| Paginação por cursor da auditoria (DP-15)                                                     | M9    |
