# 01 — Visão e escopo

## 1. Objetivo

Dar aos 5 membros do Consórcio da Família Steam um lugar único e confiável para:

1. saber, a qualquer momento, **quem deve quanto a quem e até quando**;
2. realizar e registrar o **sorteio mensal** de forma pública e auditável;
3. conduzir o **ciclo do jogo**: escolha, aviso prévio, janela de veto, compra, sobra e reembolso;
4. **votar** e gerar **ATAs** automaticamente, mantendo a Lista de Jogos Bloqueados;
5. ver os **jogos de cada membro**, a **biblioteca compartilhável da família** e as **listas de desejos**, puxados da Steam;
6. guardar os **comprovantes** e a **trilha de auditoria** que hoje ficariam espalhados no GRUPO e na planilha.

O sistema **substitui a planilha** do art. 39. Quanto ao GRUPO, a recomendação é que o sistema seja o registro oficial e o GRUPO receba textos e links prontos (D-01).

## 2. Contexto e restrições do Regulamento

| Parâmetro (v1.0) | Valor | Origem |
|---|---|---|
| Membros | 5 | art. 4º |
| Contribuição mensal | R$ 25,00 (2500 centavos) | art. 5º |
| Prêmio base (5 pagantes) | R$ 125,00 = R$ 100 dos demais + R$ 25 próprios | art. 5º, §2º |
| Dia do sorteio | 3 de cada mês, dia útil ou não | art. 8º |
| Prazo de pagamento | dia do sorteio; +7 dias corridos com justificativa | art. 11 |
| Janela para convocar veto | 48 h do aviso | art. 23 |
| Duração de votação | até 48 h ou até atingir o QUÓRUM | art. 41 |
| Prazo de compra | 30 dias corridos do sorteio | art. 20 |
| QUÓRUM | maioria absoluta dos MEMBROS (3 de 5) | art. 2º, IX |
| Vigência de alteração | mês seguinte à aprovação | art. 42 |
| Bloqueio de vaga na família | 1 ano | arts. 35 e 36 |

Restrições estruturais:

- **Sem administradora e sem guarda de recursos** (art. 3º). O sistema não tem papel de admin, não tem saldo e não recebe dinheiro.
- **Todos mantêm o controle** (art. 39): qualquer membro registra fatos, e ninguém altera o registro de outro sem o rito previsto.
- **Escala:** 5 usuários, cerca de 12 rodadas por ano e centenas de registros. Performance não é critério de desenho; correção e auditabilidade são.

## 3. Atores

| Ator | Quem é | Acesso |
|---|---|---|
| **Membro** | Signatário ativo (status `ATIVO` ou `IMPOSSIBILITADO`) | Leitura total e todas as ações coletivas; vota |
| **Fundador pendente / Candidato** | Fundador antes da vigência ou admitido aguardando assinatura ou início de ciclo | Onboarding: completar cadastro, ler e assinar o Regulamento |
| **Ex-membro com pendência** | Saiu ou foi excluído e ainda deve ou tem a receber (arts. 31 e 33) | Só as próprias obrigações e os próprios pagamentos |
| **Integrante não membro** | Pessoa da Família Steam fora do consórcio (ex.: conta infantil) | Sem login; é só um registro |
| **Sistema** | Job `tick` e efeitos automáticos de votação | Executa sorteio agendado, fecha votações vencidas, sincroniza a Steam |
| **Operador técnico** | Quem hospeda o sistema | Só CLI de bootstrap e infraestrutura; **sem poder de negócio** na aplicação |

## 4. Escopo

### 4.1 Dentro do escopo (v1)

- Login com Steam (OpenID 2.0) e lista de permitidos; onboarding; perfil; chave Pix.
- Bootstrap dos fundadores por CLI; assinatura eletrônica da v1.0; vigência com a última assinatura.
- Integração Steam: nick e avatar, biblioteca de cada membro, biblioteca compartilhável da família, lista de desejos (importada e manual), cache de dados de loja (preço em BRL, categoria *Family Sharing*, conteúdo adulto, tipo).
- Ciclos e rodadas; declarações de não concorrer; elegibilidade (art. 10); sorteio auditável; contemplação obrigatória (art. 14); rodada sem contemplado.
- Obrigações (contribuição, sobra, repasse de cessão, rateio), pagamentos com comprovante, confirmação e contestação pelo credor, justificativa e prorrogação, atraso e postergação derivados.
- Aviso prévio, validações dos arts. 16 a 19, janela e votação de veto, autorização do art. 16, IV, compra, reembolso, fechamento, sobra e complementação.
- Votações de todos os assuntos, com quórum, encerramento antecipado, ATA numerada (Anexo II) e efeitos automáticos.
- Anexo I (Lista de Jogos Bloqueados) com inclusão por veto e exclusão por votação.
- Cessão da vez; impossibilidade (art. 30); saída e exclusão; admissão; integrantes da família e bloqueio de vaga.
- Fim de ciclo: janela de revisão, confirmações, ciclo seguinte e rateio final.
- Versões do Regulamento com parâmetros e vigência.
- Painel de pendências por pessoa; textos prontos para o GRUPO; trilha de auditoria; exportação CSV/JSON.

### 4.2 Fora do escopo (v1) e quando entra

| Item | Motivo | Quando reconsiderar |
|---|---|---|
| Postar sozinho no GRUPO (bot WhatsApp, Discord, Telegram) | Depende da plataforma do GRUPO (D-26); o texto para copiar funciona em qualquer uma | Se o GRUPO for Discord ou Telegram e alguém esquecer de postar |
| Notificação por e-mail ou push | A Steam não fornece e-mail; o painel de pendências cobre a v1 | Se os prazos passarem a ser perdidos |
| Movimentar dinheiro, conciliar Pix por API bancária | Vedado pelo art. 3º, p.u., e desnecessário | Nunca |
| Ler a Família Steam pela API oficial (`IFamilyGroupsService`) | Exige token de sessão do usuário (cerca de 24 h), inviável num job | Se a Valve liberar acesso por API key |
| Detectar trapaças (art. 37) ou restrição de acesso (art. 21) | Não verificável | Reportar via votação de caso omisso |
| Sorteio com beacon público (drand) | O congelamento do snapshot com o sorteio feito ao vivo basta para 5 amigos | Se houver desconfiança do operador (ver RN-SOR-08) |
| Assinatura digital ICP/gov.br integrada | Aceite eletrônico com hash basta entre as partes; PDF assinado pode ser anexado | Se exigirem validade jurídica mais forte |
| App mobile nativo | Web responsiva, *mobile-first*, cobre | — |

## 5. Princípios de desenho

1. **O texto manda.** Toda regra cita o artigo. Onde o texto é omisso, o default é o mais literal e reversível, e fica registrado em D-nn para ratificação.
2. **Ninguém é dono das regras.** Mudanças de valor, lista, membros ou registros de terceiros só acontecem como efeito de ATA aprovada (arts. 3º e 43).
3. **Registrar, não punir.** O sistema marca irregularidades e sugere votação; não inventa sanções que o texto não prevê.
4. **Derivar em vez de armazenar estado temporal.** Atraso, postergação, janela de veto e votação vencida são funções puras de dados e relógio (`now`). Não há job que "marque atraso".
5. **Imutável e auditável.** Sorteio, voto, ATA e adesão nunca são editados nem apagados; pagamento e obrigação só mudam de estado. Toda mutação gera `EventoAuditoria` na mesma transação.
6. **Transparência total entre membros.** Tudo é visível a todos os membros (arts. 39 e 40), exceto dados de sessão.
7. **Mínimo de dados pessoais.** Sem CPF e sem data de nascimento; chave Pix de preferência aleatória.
8. **Simples antes de esperto.** Uma app, um banco e um job. Nada de fila, cache distribuído ou micro-serviço.

## 6. Glossário (Regulamento ↔ sistema)

Os identificadores de domínio no código ficam **em português, sem acento** (linguagem ubíqua, ADR-004).

| Termo do Regulamento | Entidade / conceito no sistema | Observação |
|---|---|---|
| FAMÍLIA STEAM | `IntegranteFamilia` (vínculos) | Inclui integrantes não membros |
| MEMBRO | `Membro` (vínculo de uma `Pessoa` com o consórcio) | Status ATIVO ou IMPOSSIBILITADO conta como MEMBRO |
| Signatário / assinatura | `Adesao` | Snapshot imutável com o hash da versão |
| CICLO | `Ciclo` | Termina quando todos os participantes foram contemplados (art. 2º, III) |
| Participante do ciclo | `ParticipacaoCiclo` | Quem concorre e contribui naquele ciclo |
| Mês / sorteio do mês | `Rodada` | Uma por mês com sorteio; pode ficar sem contemplado |
| Registro do sorteio | `Sorteio` | Execução imutável com snapshot de elegibilidade |
| SORTEADO | `Rodada.sorteadoOriginalId` / `Rodada.contempladoId` | O contemplado vigente muda com a cessão |
| Contribuição | `Obrigacao` tipo `CONTRIBUICAO` | Devedor → credor (contemplado) |
| Pagamento por Pix | `Pagamento` | Com comprovante (exceto forma diversa, que só conta se confirmada) e `pixEm`; `recebedorId` = para quem foi o Pix |
| PRÊMIO | derivado: `contribuicao × pagantesNoCorte + sobra recebida` | Nominal (D-07) |
| SOBRA | `Obrigacao` tipo `SOBRA` + `Rodada.sobraCentavos` | Repassada ao próximo contemplado |
| Complementação | derivado: `max(0, gasto − prêmio)` | Só exibida; não gera dívida |
| Aviso prévio (art. 22) | `AvisoCompra` | Abre a janela de 48 h |
| Aquisição / compra | `Aquisicao` | Com comprovante; reembolso no mesmo registro |
| Justificativa (art. 11, p.u.) | `Declaracao JUSTIFICATIVA_PRORROGACAO` (cópia em `Obrigacao.justificadaEm`) | Prorroga por 7 dias |
| Optar por não concorrer (art. 12) | `Declaracao` tipo `NAO_CONCORRER` | Vale até o corte do sorteio |
| Cessão da vez (art. 13) | `Cessao` + `Votacao` `CESSAO_VEZ` | Exige aceite do beneficiário |
| Postergação (art. 29) | derivada (`postergado(pessoa, ciclo, t)`) | Pegajosa no ciclo (D-08) |
| Impossibilidade (art. 30) | `Membro.status = IMPOSSIBILITADO` | Fora dos sorteios até ATA |
| Votação | `Votacao` + `Voto` | Assunto, proposição e efeito tipado |
| ATA | `Ata` | Numeração sequencial global; formato do Anexo II |
| QUÓRUM | `Votacao.quorum = floor(n/2)+1` | `n` congelado na convocação |
| Lista de Jogos Bloqueados (Anexo I) | `JogoBloqueado` | Entrada 01 = categoria, protegida |
| Versão do Regulamento | `VersaoRegulamento` | Texto, hash, parâmetros e vigência |
| GRUPO | canal externo; o sistema gera textos (`textosGrupo`) | D-01 |
| Planilha (art. 39) | o próprio sistema + exportação CSV | — |
| Casos omissos (art. 43) | `Votacao` `CASO_OMISSO` com efeito tipado opcional | Única via de correção de registros |

## 7. Premissas

- Todos os 5 fundadores têm conta Steam adulta e já estão (ou estarão) na mesma Família Steam.
- Cada membro consegue deixar **Detalhes dos jogos** público no perfil Steam. Quem não deixar tem integração parcial, com fallback manual (doc 06).
- Um membro ou alguém de confiança do grupo (Operador) hospeda o sistema. O ideal é que pelo menos 2 membros tenham acesso à infraestrutura (RN-ACE-11).
- O GRUPO continua existindo para conversa e chamada; o sistema é o registro.
