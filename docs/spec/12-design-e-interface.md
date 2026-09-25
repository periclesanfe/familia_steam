# 12 — Design, interface e padronização

Identidade **sóbria**: o app é uma ferramenta de registro entre cinco amigos, e o visual deve passar a ideia de "livro-caixa confiável", sem cara de loja de jogos. Este documento complementa o [07](07-telas-e-rotas.md), que diz **o que** cada tela mostra, e fixa **como** tudo aparece e se comporta. As decisões são numeradas (`UI-nn`) para serem citadas no código e nos PRs.

Pesquisa feita em 25/09/2026, com as versões instaladas: shadcn CLI 4.21 (base Radix, estilo `radix-nova`, cor-base `neutral`), Tailwind 4.3, tw-animate-css 1.4, lucide-react 1.x, Next 16.3.6 e React 19.2.

## 1. Princípios

1. **Informação antes de decoração.** Cada pixel com cor, peso ou movimento precisa carregar significado: estado, prazo, valor, ação.
2. **Cor só com função.** A base é neutra (croma 0). Só estado usa cor (sucesso, atenção, perigo), e sempre acompanhada de ícone e texto.
3. **Uma família tipográfica** (Geist) e uma escala curta.
4. **Mobile-first.** O membro paga o Pix pelo celular: as ações mais usadas ("Paguei", "Votar", "Confirmar") ficam alcançáveis com o polegar e sem rolagem horizontal.
5. **A linguagem é a do Regulamento** (SOBRA, ATA, contemplado) e os rótulos vêm de um único dicionário (`src/lib/rotulos.ts`).
6. **O sistema responde a toda ação**: pendente, sucesso ou erro, sem ação silenciosa.
7. **Menos componentes, mais consistência.** Nada de fork de componente por tela; variantes só via `cva` em `src/components/ui`.

## 2. Tema e tokens

> **Revisão M10 (25/09/2026, pedido do usuário):** o app ganhou identidade própria. `primary` passa a ser um índigo de destaque (`oklch(0.49 0.2 272)`; no escuro, `oklch(0.72 0.14 275)`), com paleta de gráficos (`--chart-1..5`), ícone próprio (`src/app/icon.svg`) e tela de login com cartão. Há alternador de tema (claro/escuro/sistema) guardado em cookie e lido no layout raiz, sem flash. O shell tem cabeçalho (menu lateral, família, tema e conta) e o painel tem indicadores e gráficos (recharts pelo `chart` do shadcn). Os estados continuam neutro/sucesso/atenção/perigo, e o contraste AA segue verificado por `pnpm contraste` nos dois temas. Os itens abaixo marcados "(rev. M10)" no código substituem o texto original de UI-01, UI-04 e UI-09.

### UI-01 — Base shadcn `radix-nova` + `neutral`, sem cor de marca

- `primary` é o quase-preto neutro do padrão (`oklch(0.205 0 0)`; no escuro, `oklch(0.922 0 0)`). Não há "cor da Família Steam", nem o azul da Steam.
- Sem gradientes, sem glassmorphism e sem sombras além de `shadow-xs`. Cards se separam por **borda**, não por sombra.
- `--radius: 0.5rem` (o padrão é 0.625rem). Cantos um pouco mais retos combinam com o registro.
- Não há ilustrações. Estados vazios usam texto e ação (§6).

### UI-02 — Correções de contraste (WCAG 2.2 AA)

Os tokens padrão do `neutral` falham em três pontos: texto secundário sobre `muted`, borda de campo e anel de foco. As razões abaixo foram calculadas (OKLCH → sRGB → luminância relativa) com o script de verificação do §10.

| Token (tema)                 | Padrão                            | Novo                      | Razão resultante                                                                           |
| ---------------------------- | --------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| `--muted-foreground` (claro) | `oklch(0.556 0 0)`                | `oklch(0.52 0 0)`         | 5,05:1 sobre `muted` (antes 4,34:1, reprovado)                                             |
| `--input` (claro)            | `oklch(0.922 0 0)`                | `oklch(0.66 0 0)`         | 3,11:1 sobre branco: a borda do campo é o único contorno                                   |
| `--ring` (claro)             | `oklch(0.708 0 0)`                | `oklch(0.556 0 0)`        | 4,73:1 (`focus-visible:border-ring`)                                                       |
| `--input` (escuro)           | `oklch(1 0 0/15%)`                | `oklch(1 0 0/35%)`        | 3,14:1 sobre o fundo                                                                       |
| `--destructive` (claro)      | `oklch(0.577 0.245 27.325)`       | `oklch(0.53 0.22 27.325)` | 4,87:1 sobre `destructive/10` (o botão `destructive` do nova usa esse fundo; antes 3,99:1) |
| `--sidebar-primary` (escuro) | azul `oklch(0.488 0.243 264.376)` | `oklch(0.922 0 0)`        | tira a única cor de marca do tema padrão                                                   |

`--border` continua `oklch(0.922 0 0)`: é decorativo (separa cards e linhas), e o WCAG 1.4.11 não exige 3:1 para isso.

### UI-03 — Tokens de estado: `success` e `warning`

Criados pelo padrão documentado do shadcn (`:root` + escuro + `@theme inline`), o que gera `text-success`, `bg-warning/10` etc.

| Token       | Claro                  | Escuro                 | Verificação                                                           |
| ----------- | ---------------------- | ---------------------- | --------------------------------------------------------------------- |
| `--success` | `oklch(0.50 0.13 150)` | `oklch(0.76 0.14 150)` | texto sobre `success/10`: 4,91:1 / sobre `success/20` no card: 5,92:1 |
| `--warning` | `oklch(0.53 0.13 65)`  | `oklch(0.80 0.13 75)`  | texto sobre `warning/10`: 4,75:1 / sobre `warning/20` no card: 6,20:1 |

O padrão de uso é **texto na cor + fundo na mesma cor a 10% (claro) ou 20% (escuro)**. Não existe fundo sólido colorido com texto branco: é visualmente pesado e difícil de manter acima de 4,5:1.

**Tons semânticos** (usados por `StatusBadge`, `Prazo`, `Alert` e células da grade):

| Tom       | Uso                                               | Classes                                                     | Ícone (lucide)    |
| --------- | ------------------------------------------------- | ----------------------------------------------------------- | ----------------- |
| `neutro`  | informação, agendado, aguardando                  | `bg-secondary text-secondary-foreground`                    | `Circle`, `Clock` |
| `sucesso` | quitado, aprovado, autorizado, concluído          | `bg-success/10 text-success dark:bg-success/20`             | `CircleCheck`     |
| `atencao` | prazo < 24 h, prorrogado, contestado, verificando | `bg-warning/10 text-warning dark:bg-warning/20`             | `TriangleAlert`   |
| `perigo`  | em atraso, vencido, rejeitado, irregular          | `bg-destructive/10 text-destructive dark:bg-destructive/20` | `CircleAlert`     |
| `inativo` | cancelado, excluído, encerrado, substituído       | `border-border text-muted-foreground` (outline)             | `CircleSlash`     |

### UI-04 — Tema claro e escuro pelo sistema, sem JavaScript

- O tema segue `prefers-color-scheme`. **Não há alternador** na v1 e **não há `next-themes`**: a biblioteca está sem release desde 03/2025 e gera aviso de `<script>` com React 19. O resultado é zero JS de tema e nenhum flash na carga. _ponytail:_ se pedirem alternador manual, adotar o `next-themes` 0.4.6 e aceitar o aviso em dev.
- Não ler cookie de tema no layout raiz: isso tornaria tudo dinâmico e bloquearia o shell.
- `color-scheme: light dark` no `:root`, para barras de rolagem e controles nativos.
- `export const viewport` no layout raiz com `themeColor` por `media` (`#ffffff` / `#0a0a0a`).

### UI-05 — `globals.css`: diferença em relação ao gerado pelo init

```css
/* antes: @custom-variant dark (&:is(.dark *)); */
@custom-variant dark (@media (prefers-color-scheme: dark));

@theme inline {
  /* … mapeamentos gerados … */
  --color-success: var(--success);
  --color-warning: var(--warning);
}

:root {
  color-scheme: light dark;
  --radius: 0.5rem;
  --muted-foreground: oklch(0.52 0 0);
  --input: oklch(0.66 0 0);
  --ring: oklch(0.556 0 0);
  --destructive: oklch(0.53 0.22 27.325);
  --success: oklch(0.5 0.13 150);
  --warning: oklch(0.53 0.13 65);
  /* … demais tokens gerados … */
}

@media (prefers-color-scheme: dark) {
  :root {
    /* o bloco que era `.dark { … }`, com: */
    --input: oklch(1 0 0 / 35%);
    --sidebar-primary: oklch(0.922 0 0);
    --success: oklch(0.76 0.14 150);
    --warning: oklch(0.8 0.13 75);
  }
}

@layer base {
  /* Tailwind 4 voltou os botões para cursor: default; o guia oficial devolve o pointer */
  button:not(:disabled),
  [role='button']:not(:disabled) {
    cursor: pointer;
  }
  /* §7: tw-animate-css e React não tratam movimento reduzido */
  @media (prefers-reduced-motion: reduce) {
    *,
    ::before,
    ::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}

@media print {
  /* §9: ATA e extrato impressos */
}
```

## 3. Tipografia, números e datas

### UI-06 — Uma família, escala curta

- **Geist** (variável, via `next/font`, auto-hospedada) para tudo. O subset `latin` cobre todos os acentos do pt-BR, o `R$` e o espaço sem quebra; `latin-ext` é desnecessário.
- **Geist Mono** só para identificadores: SteamID64, hash (`sha256`), código de amigo e nº de ATA no cabeçalho da ATA. Nunca para dinheiro.

| Papel            | Classes                                 | Onde                                   |
| ---------------- | --------------------------------------- | -------------------------------------- |
| Título da página | `text-2xl font-semibold tracking-tight` | `CabecalhoPagina` (um `h1` por página) |
| Título de seção  | `text-lg font-semibold`                 | `h2` dentro da página                  |
| Título de card   | `text-base font-medium`                 | `CardTitle`                            |
| Corpo            | `text-sm` (padrão do nova)              | tudo                                   |
| Apoio            | `text-sm text-muted-foreground`         | descrições, dicas, metadados           |
| Miúdo            | `text-xs text-muted-foreground`         | só legenda de tabela e rodapé          |

Pesos: 400, 500 e 600. Nada de 700+, itálico decorativo ou caixa-alta fora dos termos definidos do Regulamento.

### UI-07 — Dinheiro

- Sempre pelo componente `Dinheiro` (ou `formatarBRL` de `src/domain/dinheiro.ts`, já implementado): `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` produz `R$ 1.234,50`, com espaço sem quebra.
- Algarismos tabulares (`tabular-nums`) em qualquer valor que apareça em coluna, placar ou contagem, para os dígitos não "dançarem".
- Em tabela: alinhado à direita; totais em `font-medium`.
- Negativo ou "a pagar" leva **sinal e texto**, nunca só cor: `−R$ 25,00` ou "deve R$ 25,00". A cor `text-destructive` é reforço, não o sinal.
- Entrada de valor (§5): `InputGroup` com prefixo `R$`, `inputMode="decimal"`, aceitando `25`, `25,5`, `1.234,56`. O parser (`centavosDeTexto`) fica em `src/domain/dinheiro.ts`, com teste.

### UI-08 — Datas e horas

- O fuso de negócio é `America/Sao_Paulo` em tudo, **inclusive no navegador**. O `Intl.DateTimeFormat` recebe o `timeZone` explícito, e por isso a mesma data sai idêntica no servidor (UTC) e no cliente, sem _hydration mismatch_.
- Formatos:
  - data: `03/10/2026`;
  - data e hora: `03/10 às 12:00`, com o ano só se diferente do atual;
  - intervalo de prazo: `até 10/10 às 23:59`. "Fim do dia D" aparece como `D às 23:59`, embora o instante interno seja `D+1 00:00` (README da spec).
- A indicação "horário de Brasília" aparece **uma vez por tela** (no rodapé do shell) e em todo campo de data e hora. O `DataHora` tem `<time dateTime>` com ISO e `title` com a data completa. Isso ajusta o "sempre com a indicação" do [07](07-telas-e-rotas.md): repetido em cada linha, vira ruído.
- Datas relativas ("em 3 h") só no `Prazo` (§8). Listas e auditoria usam data absoluta.
- Campo de data e hora (`pixEm`, horário de mensagem transcrita): `<input type="datetime-local">` nativo. O valor chega **sem fuso** e o servidor o interpreta em `America/Sao_Paulo`, nunca no fuso do navegador (função `instanteDeCampoLocal` em `src/domain/tempo.ts`, com teste para o horário de verão caso volte a existir).

## 4. Layout e navegação

### UI-09 — Shell

- **Desktop (≥ `md`):** `Sidebar` do shadcn com os 7 itens do [07 §2](07-telas-e-rotas.md#2-navegação), modo `icon` recolhível e atalho `⌘/Ctrl+B` (já vem no componente). **Celular:** o mesmo componente vira `Sheet` (comportamento nativo dele), aberto por um botão fixo no cabeçalho, com o selo de pendências ao lado.
- Cabeçalho do celular: botão de menu, título curto da página e selo de pendências. Nada de _bottom navigation_: 7 destinos não cabem, e o painel já é a porta de entrada.
- Um link "Pular para o conteúdo" como primeiro elemento focável, visível só no foco.
- Rodapé do shell: "Horários de Brasília · versão do Regulamento vigente (link)".

### UI-10 — Página

- Contêiner único: `mx-auto w-full max-w-5xl px-4 py-6 md:px-6`. Telas de leitura longa (Regulamento, ATA) usam `max-w-3xl` e `prose` próprio (sem o plugin typography: classes no componente `Markdown`).
- `CabecalhoPagina`: título (`h1`), descrição opcional e ações à direita. No celular, as ações descem para baixo do título, em largura total.
- Espaçamento: `gap-2` dentro de controles, `gap-4` entre campos e itens, `gap-6` entre seções. Só esses três degraus.
- **A página nunca rola na horizontal.** Tabela larga (a grade do ciclo, 5 × 12, e a matriz devedor × credor) rola dentro do próprio contêiner (`overflow-x-auto`), com a primeira coluna `sticky`. Em tela estreita, listas de obrigações e pagamentos viram **lista de itens** (componente `Item`), não tabela espremida.
- Abas da rodada (`?aba=`): `AbasNaUrl`, uma `<nav>` de `Link`s com `aria-current="page"` e visual de `TabsList`. É navegação, não o widget `tabs` (que guardaria estado no cliente e quebraria o link compartilhável).

## 5. Componentes e formulários

### UI-11 — Catálogo shadcn (substitui a lista do [07 §6.1](07-telas-e-rotas.md#61-shadcnui-em-srccomponentsui-gerados-pela-cli))

**Usar:** `button`, `card`, `badge`, `alert`, `alert-dialog`, `dialog`, `sheet`, `sidebar`, `dropdown-menu`, `field`, `input`, `input-group`, `textarea`, `native-select`, `radio-group`, `checkbox`, `label`, `table`, `item`, `tooltip`, `popover`, `command`, `avatar`, `skeleton`, `separator`, `pagination`, `empty`, `spinner`, `sonner`.

**Não usar**, e por quê:

| Componente                                        | Motivo                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `form` (legado)                                   | saiu do registry; o `field` não depende de biblioteca de formulário                                               |
| `select` (Radix)                                  | `native-select` funciona com `FormData` sem input oculto, abre o seletor nativo do celular e é acessível de graça |
| `tabs`                                            | abas são navegação por URL (UI-10)                                                                                |
| `hover-card`                                      | não funciona no toque; `ArtigoRef` usa `popover` (texto de artigo é longo demais para tooltip)                    |
| `scroll-area`, `breadcrumb`, `progress`, `switch` | `overflow-x-auto`, link "voltar", barras próprias do `PlacarVotacao` e `checkbox` resolvem                        |
| `data-table` / TanStack Table                     | 5 usuários: `table` renderizada no servidor, com ordenação e filtro em `searchParams`                             |
| `toast` (Radix)                                   | descontinuado em favor do `sonner`                                                                                |

Ajustes após o `shadcn add`:

- **`sonner.tsx`:** remover o `useTheme` de `next-themes` e passar `theme="system"`, `containerAriaLabel="Notificações"` e `closeButtonAriaLabel="Fechar"`. Remover `next-themes` do `package.json` se a CLI o instalar.
- **`spinner.tsx`:** trocar o `aria-label="Loading"` por `"Carregando"`.
- Nenhum outro componente de `ui/` é editado por tela. Mudança visual global vai para o token; variante nova vai para o `cva` do próprio componente, com justificativa no PR.

### UI-12 — Ícones

- Só `lucide-react`, com imports nomeados (o Next 16 já otimiza o pacote). Tamanho `size-4` no texto e nos botões, `size-5` no máximo em cabeçalho. Traço padrão.
- A v1 do lucide **removeu os ícones de marca**. O login usa a imagem oficial da Valve "Sign in through Steam" (`sits_01.png`), copiada para `public/` e servida com `<img alt="Entrar com Steam">`. Sem SVG feito à mão e sem `simple-icons`.
- Botão só com ícone leva o nome dentro: `<Button size="icon"><Trash2 /><span className="sr-only">Remover</span></Button>`. O lucide já põe `aria-hidden` no SVG.
- Ícones com significado de estado seguem a tabela de tons (UI-03). Ícone decorativo ao lado de texto que já diz tudo é dispensável.

### UI-13 — Formulários: Server Action nativa, sem biblioteca

**Mudança de decisão:** o [07 §6.3](07-telas-e-rotas.md#63-regras-de-componentização) e o [08 §1](08-arquitetura-e-qualidade.md#1-stack-versões-conferidas-em-24092026) previam `react-hook-form` + `@hookform/resolvers`. A decisão passa a ser **`<form action>` + `useActionState`**, com zod **só no servidor**:

- A documentação do shadcn já trata o `field` como independente de biblioteca, e o `form` antigo (que era a ponte para o RHF) saiu do registry.
- Os formulários daqui são curtos, e validação instantânea no cliente não compensa duas dependências e um segundo caminho de dados.
- Sem JavaScript, o formulário continua funcionando (_progressive enhancement_), o que também simplifica os testes E2E.

Padrão único:

```tsx
'use client'
const [estado, enviar, pendente] = useActionState(registrarPagamentoAcao, estadoInicial)

<form action={enviar} noValidate={false}>
  <input type="hidden" name="obrigacaoId" value={obrigacaoId} />
  <Field data-invalid={!!estado.erros?.valor}>
    <FieldLabel htmlFor="valor">Valor pago</FieldLabel>
    <InputGroup>
      <InputGroupInput id="valor" name="valor" inputMode="decimal" required
        defaultValue={estado.valores?.valor} aria-invalid={!!estado.erros?.valor}
        aria-describedby="valor-erro" />
      <InputGroupAddon>R$</InputGroupAddon>
    </InputGroup>
    <FieldError id="valor-erro" errors={estado.erros?.valor} />
  </Field>
  <Button type="submit" disabled={pendente}>
    {pendente && <Spinner data-icon="inline-start" />} Registrar pagamento
  </Button>
</form>
```

Regras:

- **Toda mutação é um `<form>`**, inclusive os botões de linha ("Confirmar", "Votar a favor", "Sair"): um `<form>` com `input type="hidden"` e um botão. Não há `onClick={() => acao(...)}`.
- A action devolve `{ ok: true } | { ok: false, erros?, codigo?, mensagem?, artigo?, valores }` (o contrato de `acao()` no [08 §4.1](08-arquitetura-e-qualidade.md#41-server-action-fina-e-sempre-igual)). **`valores` volta sempre**, porque o React 19 limpa os campos não controlados quando a action termina, mesmo quando ela devolve erro. Os campos usam `defaultValue={estado.valores?.campo}`.
- Validação nativa do HTML (`required`, `min`, `max`, `maxLength`, `type`, `inputMode`) como primeira linha, porque é grátis e em pt-BR no navegador do usuário. **A autoridade é o zod no servidor**; o cliente nunca é confiável.
- Formulário cujos campos dependem de uma escolha (a votação nova, com a união discriminada por `assunto`): o `assunto` é estado local (`useState`) que decide quais `Field` renderizar, e vai num `input hidden`. O servidor valida com `z.discriminatedUnion`. `FormData` vira objeto num único helper (`lerFormulario` em `src/server/acao.ts`), que trata checkboxes múltiplos e campos vazios.
- **Pendente:** botão desabilitado com `Spinner` e o mesmo texto. O layout não muda. Proteção contra duplo envio: o `disabled` na UI e, de verdade, as constraints únicas do banco ([05 §3](05-modelo-de-dados.md)).
- **Erros:**
  - campo inválido: inline, no `FieldError`, com a mensagem em pt-BR do schema;
  - `ErroDeNegocio`: `Alert` no topo do formulário, com a mensagem e o `ArtigoRef` do artigo (ex.: "Prazo de veto encerrado. Art. 23 §2º");
  - erro inesperado: `toast.error('Não foi possível concluir. Tente de novo.')`, com o detalhe só no log do servidor;
  - `Failed to find Server Action` (cliente com build antigo depois de um deploy): "O app foi atualizado. Recarregue a página." com botão de recarregar.
- **Sucesso:** `toast.success` curto no passado ("Pagamento registrado"). Quando a ação muda de tela (ex.: convocar votação), `redirect` para o destino, sem toast.
- **Atos irreversíveis** (voto, assinatura, sorteio, saída, declaração de impossibilidade) passam por `ConfirmarAcao` ([07 §6.2](07-telas-e-rotas.md#62-compartilhados-de-domínio-srccomponents)): `alert-dialog` com as consequências em lista, o artigo e, nos atos graves, um checkbox "Entendi". O botão de confirmar repete o verbo ("Votar a favor", não "OK").
- Upload (`UploadComprovante`): `<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf">`, com prévia local por `URL.createObjectURL`. O tamanho é checado no cliente (≤ 5 MB) só para poupar o envio; o servidor valida de novo pelos _magic bytes_ (RN-ACE-09).

## 6. Estados de tela

- **Carregando:** `loading.tsx` por segmento com `Skeleton` no **formato do conteúdo final** (mesmas alturas), para não haver salto. Skeleton só onde há espera real: a navegação entre páginas do app com Postgres local costuma ser instantânea, e um skeleton que pisca por 50 ms incomoda mais do que ajuda. Os blocos com dado da Steam (biblioteca, capas) ficam em `<Suspense>` próprio.
- **Vazio:** sempre `Empty` com título, uma frase que explica o porquê e a ação possível. Exemplo: "Nenhuma votação aberta. Votações nascem de um aviso de jogo, de uma cessão ou de um caso omisso." + "Convocar votação".
- **Erro:** `error.tsx` por segmento com "Algo deu errado ao carregar esta página", botão "Tentar de novo" (`reset`) e o `digest` em texto miúdo para o log. `not-found.tsx` global com link para o Painel. Acesso negado (`403` do guard) tem tela própria, com o motivo ("Esta área é só para membros ativos").
- **Parcial:** a Steam fora do ar ou o perfil privado não quebram a página. O bloco mostra o último dado salvo com "atualizado em …" e o guia de privacidade ([06 §7](06-integracao-steam.md#7-orientação-ao-membro-tela-minha-conta-steam)).

## 7. Movimento

### UI-14 — Pouco, curto e com propósito

Nada de biblioteca de animação (`motion`/`framer-motion`): o que o shadcn já traz (tw-animate-css nos overlays) e CSS bastam para um visual sóbrio.

| Onde                                                    | Como                                                                                | Duração                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| hover, foco, troca de cor                               | `transition-colors`                                                                 | 150 ms (padrão do Tailwind)   |
| dialog, alert-dialog, dropdown, popover, sheet, tooltip | o que o componente já traz (`animate-in fade-in-0 zoom-in-95`, `slide-in-from-*-2`) | 200 ms entrada / 150 ms saída |
| toast                                                   | o do `sonner`                                                                       | o da biblioteca               |
| altura (seção expansível)                               | `collapsible` + `animate-collapsible-down/up` (variáveis do Radix)                  | 200 ms                        |
| alerta ou item recém-criado                             | `starting:opacity-0 transition-opacity` (`@starting-style`, sem JS)                 | 200 ms                        |
| barras do `PlacarVotacao` após um voto                  | `motion-safe:transition-[width]`                                                    | 300 ms                        |
| skeleton                                                | `animate-pulse`                                                                     | o padrão                      |

- **Durações permitidas:** 150, 200 e 300 ms (`duration-150/200/300`). **Easing:** `ease-out` na entrada, `ease-in` na saída. Nenhuma outra duração nos arquivos de tela (a checagem do §10 aponta).
- **O que não anima:** troca de página (sem slides de rota), números (sem _count-up_: o valor final aparece direto), listas (sem _stagger_), o tique do contador e o foco (o anel aparece seco).
- O `translate-y-px` no `:active` do botão (vem do nova) fica. É o único "movimento" de clique.
- **Movimento reduzido:** a regra global do UI-05 encurta tudo para 0,01 ms. É 0,01 ms e não `none` para o Radix ainda receber o `animationend` e desmontar o overlay fechado. Spinners ganham `motion-reduce:hidden` e mantêm o texto do botão.
- **View Transitions ficam de fora da v1.** O `<ViewTransition>` funciona no Next 16.3 sem configuração, mas o padrão de entrada/saída por página tem problema aberto (react#37614) e o ganho é estético. _ponytail:_ se adotar, só crossfade na troca de aba por URL, com `default="none"` (senão anima a cada `router.refresh()` e a cada action), sempre no `page.tsx` e nunca no layout, com `::view-transition { pointer-events: none }` e com a regra de movimento reduzido estendida a `::view-transition-*`.

## 8. Contagem regressiva e dados vivos

### UI-15 — `Prazo`

- Um **relógio compartilhado** para a página inteira: um único `setInterval` alinhado ao segundo, exposto por `useSyncExternalStore`, que **pausa com `document.hidden`** e recalcula ao voltar (`visibilitychange`). Nunca um intervalo por componente.
- No servidor e na hidratação, o `getServerSnapshot` devolve `null` e o `Prazo` mostra **só a data absoluta** (`até 10/10 às 23:59`). Depois da hidratação, acrescenta o relativo ("faltam 3 h 12 min"). Não há _hydration mismatch_ nem `suppressHydrationWarning`.
- Granularidade: minuto quando falta mais de 1 h; segundo só na última hora. O texto relativo sai de `formatarDuracao(ms)` em `src/domain/tempo.ts` (função pura, com teste), sem biblioteca.
- Tons: `neutro` com mais de 24 h, `atencao` com menos de 24 h, `perigo` vencido ("venceu há 2 h"). O tom vem com ícone e com o texto, não só com a cor.
- Acessibilidade: o texto relativo fica num `<span role="timer">` (anúncio implícito desligado), e o `<time dateTime>` fica sempre presente. **Nunca `aria-live` em algo que muda a cada segundo.** A passagem de um marco ("Prazo encerrado", "Janela de veto encerrada") é anunciada uma vez numa região `aria-live="polite"` separada.
- Em **listas** (painel, obrigações, votações), só a data absoluta e o tom. O contador vivo aparece na tela de detalhe. Isso reduz ruído e o risco com o WCAG 2.2.2 (conteúdo que se atualiza sozinho).

### UI-16 — "Tempo real" sem websocket

O [07 §1](07-telas-e-rotas.md#1-mapa-de-rotas-app-router) já define `router.refresh()` a cada 15 s nas telas de votação aberta e de rodada no dia do sorteio. Complementos:

- O refresh usa o mesmo relógio compartilhado, só roda com a aba visível e para quando a votação encerra ou o sorteio acontece.
- Um valor que mudou não pisca nem anima. O placar muda a largura da barra (UI-14) e o número troca direto.

## 9. Acessibilidade (WCAG 2.2 AA)

Complementa o [07 §7](07-telas-e-rotas.md#7-acessibilidade-e-ux):

- **Contraste:** o UI-02 e o UI-03 garantem 4,5:1 para texto e 3:1 para bordas de campo e foco. Toda cor nova passa pelo script do §10.
- **Alvo:** nenhum controle abaixo de 24 × 24 px (WCAG 2.5.8). No nova, `size="xs"`/`"icon-xs"` (24 px) é o piso e fica reservado a ações secundárias densas. Ações primárias no celular usam `size="lg"` (36 px).
- **Foco:** sempre visível (`focus-visible:ring-3 ring-ring/50` + `border-ring`, que vêm dos componentes) e nunca encoberto por cabeçalho fixo (2.4.11): `scroll-margin-top` na altura do cabeçalho.
- **Estrutura:** `lang="pt-BR"` (já no layout), um `h1` por página e hierarquia sem saltos. Landmarks `header`, `nav`, `main` e `footer`. Tabelas com `<caption>` (pode ser `sr-only`) e `scope` nos cabeçalhos.
- **Mensagens de status** (4.1.3): o `sonner` já anuncia com `aria-live="polite"`. Erros de formulário ficam ligados por `aria-describedby`, e o primeiro campo inválido recebe foco ao voltar da action.
- **Leitores de tela e valores:** `Dinheiro` e `Prazo` já produzem texto completo ("R$ 25,00", "até 10 de outubro às 23:59"). Ícones de estado têm texto ao lado. A célula da grade do ciclo tem `aria-label` com o estado por extenso ("Ana, rodada 3: quitado em atraso").
- **Impressão:** `/atas/[numero]` e `/financeiro/[pessoaId]` têm CSS de impressão: sem shell, preto sobre branco, quebra de página evitada dentro de tabela e URL do link impressa ao lado do texto.
- **Verificação:** `@axe-core/playwright` no E2E das telas principais (Painel, Rodada, Votação, Onboarding), nos dois temas (`colorScheme` do Playwright). É a única dependência nova deste documento, só de desenvolvimento.

## 10. Padronização e verificação automática

### UI-17 — Regras que o CI verifica

1. **Cor só por token.** O ESLint proíbe, fora de `src/components/ui`, classes de paleta crua (`text-gray-500`, `bg-red-600`…) e cores arbitrárias (`bg-[#…]`, `text-[oklch(…)]`):

   ```js
   // eslint.config.mjs — bloco para src/app, src/features e src/components (menos ui/)
   const paleta =
     /\b(?:bg|text|border|ring|fill|stroke|outline|from|to|via|divide|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b|-\[(?:#|oklch|rgb|hsl)/
   const duracao = /\bduration-(?!(?:150|200|300)\b)\d+\b/
   // no-restricted-syntax (repetindo semEnumTs, porque o flat config substitui a regra):
   { selector: `Literal[value=${paleta}]`, message: 'Use tokens (bg-background, text-muted-foreground, bg-destructive/10…). Ver 12 §2.' },
   { selector: `TemplateElement[value.raw=${paleta}]`, message: '…' },
   { selector: `Literal[value=${duracao}]`, message: 'Durações permitidas: 150, 200, 300 ms (12 §7).' },
   ```

2. **Rótulos de enum** só via `src/lib/rotulos.ts`. Um teste unitário percorre todos os enums de `@/generated/prisma/enums` e falha se algum valor não tiver rótulo e tom.
3. **Contraste:** `scripts/contraste.mjs` lê os tokens do `globals.css`, calcula as razões da tabela do UI-02/UI-03 e falha abaixo do mínimo. Roda no `pnpm check`.
4. **Acessibilidade:** axe no E2E (§9).

### UI-18 — Texto de interface (microcopy)

- pt-BR, frase com inicial maiúscula e o resto minúsculo ("Registrar pagamento", não "Registrar Pagamento"). Caixa-alta só nos termos definidos do art. 2º (SOBRA, ATA, GRUPO…).
- **Botões com verbo no infinitivo** e objeto: "Registrar compra", "Convocar votação", "Anexar comprovante". Evitar "OK", "Enviar" e "Salvar" soltos.
- Sem exclamação, sem emoji e sem gíria na UI. Emoji só nos textos para o GRUPO ([07 §5](07-telas-e-rotas.md#5-textos-para-o-grupo)), que são mensagens de chat.
- Mensagem de erro diz **o que houve e o que fazer**, citando o artigo quando é regra: "Você não pode votar na própria cessão (art. 21)."
- Nome de pessoa: apelido na interface; nome completo só na ATA e no extrato impresso.
- Tom da Steam: capa e avatar são as **únicas** imagens coloridas do app, e isso basta como "cara de jogo". Capas em proporção fixa (`aspect-[460/215]` para `header.jpg`) com `loading="lazy"`, `width`/`height` e fundo `bg-muted` enquanto carrega. Avatares nos tamanhos que a Steam já entrega (32, 64, 184 px) e fallback com as iniciais.

### UI-19 — Identidade

- Nome em texto ("Família Steam", `font-semibold`), sem logotipo. Não usar o logo nem as cores da Steam: é marca de terceiros, e o app não é oficial. O rodapé da tela de login traz "Não afiliado à Valve Corporation."
- Favicon: monograma "FS" monocromático (`src/app/icon.svg`), que acompanha o tema via `prefers-color-scheme` dentro do SVG.

## 11. Onde isso entra no plano

| Item                                                                                                                                              | Marco                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `globals.css` (UI-02..05), `viewport`, regras de ESLint e script de contraste (UI-17)                                                             | M1                                                         |
| `sonner`, `spinner`, `field`, `input-group`, `native-select`, `empty`; `Dinheiro`, `DataHora`, `Prazo` e o relógio compartilhado; `lerFormulario` | M2 (primeiras telas: `/entrar`, `/boas-vindas`, `/perfil`) |
| Shell com `Sidebar`, `CabecalhoPagina`, `AbasNaUrl`, `Empty`, `error.tsx`, tela 403                                                               | M2                                                         |
| `SteamAppCard`, capas e avatares                                                                                                                  | M3                                                         |
| axe no E2E; CSS de impressão                                                                                                                      | M6 (ATA) e M9 (revisão geral)                              |
