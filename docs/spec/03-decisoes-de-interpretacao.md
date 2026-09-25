# 03 — Decisões de interpretação

O Regulamento é omisso ou ambíguo em vários pontos que o software precisa resolver. Para cada um, o sistema implementa um **default**: a leitura mais literal, simples e reversível. As decisões marcadas **[DECIDIR]** mudam o comportamento de forma relevante e precisam do aval dos membros.

A v1.0 **ainda não foi assinada** (art. 46). Por isso, as decisões que **contrariam texto expresso** (no mínimo D-01, D-06 e D-15) devem entrar **no próprio texto antes das assinaturas** (§3). A ATA de caso omisso (art. 43) só serve para omissões puras. Depois da vigência, qualquer mudança exige alteração pelo art. 42, que vale no mês seguinte.

## 1. Decisões

### D-01 — Canal oficial: sistema × GRUPO **[DECIDIR]**

- **Texto:** avisos, declarações, votações e comprovantes são feitos "no GRUPO" (arts. 2º VII, 9º, 11, 12, 22, 23, 40 e 41). O controle é uma "planilha" (art. 39).
- **Opções:**
  - (a) ajustar a v1.0 para que o sistema seja o registro oficial e o GRUPO receba textos e links;
  - (b) manter o GRUPO oficial, com o sistema só registrando;
  - (c) ATA de caso omisso. É frágil, porque os arts. 39 e 41 não são omissos.
- **Default:** o sistema funciona como registro oficial (a). A transcrição com print (RN-GER-05) existe só como reserva para NAO_CONCORRER, confirmação de ciclo e justificativa. **Votos, avisos, compras e saídas só no sistema.**
- **Atenção:** se a v1.0 for assinada **sem** a redação do §3.1, votos e avisos feitos no GRUPO continuam válidos pelo texto. Antes de operar, a spec teria de ganhar a transcrição de votos e avisos, o que hoje não está previsto.
- **Recomendação:** (a), com o §3.1.

### D-02 — Data de início do 1º ciclo **[DECIDIR]**

- **Texto:** "iniciando-se o primeiro CICLO no dia 3 de ____ de ____" (art. 46).
- **Problema:** com data fixa, se alguém atrasar a assinatura, todos precisam reassinar.
- **Default:** regra "primeiro dia 3 posterior à data da última assinatura". Com todas as assinaturas até 02/10/2026, o início é 03/10/2026; senão, 03/11/2026. Veja o alerta de prazo em [10](10-plano-de-implementacao.md).

### D-03 — Horário e disparo do sorteio **[DECIDIR]**

- **Texto:** dia 3, público, "em chamada ou no GRUPO", com ferramenta online e registro por print ou gravação (arts. 8º e 9º). O horário não é fixado.
- **Default:** **12:00 (Brasília)**, no parâmetro `horaSorteio`. O tick executa sozinho e qualquer membro pode disparar se ele atrasar. Assim sobram 12 h para o Pix no mesmo dia (art. 11). O "não concorrer" vale até o corte.
- **Alternativa:** 20:00, em chamada. Os devedores ficariam com só 4 h sem precisar justificar.

### D-04 — Sorteio fora do dia 3

- **Default:** executa na primeira oportunidade, marcado `atrasada`. Os prazos contam da data real, porque ninguém paga sem saber quem é o SORTEADO.

### D-05 — Último não contemplado (art. 14) em atraso ou impossibilitado **[DECIDIR]**

- **Texto:** o art. 14 contempla "obrigatoriamente" e afasta só os arts. 12 e 13.
- **Leitura:**
  - O art. 29 se esgota, porque não restam "demais" não contemplados.
  - O art. 14, como regra especial, afasta o art. 10, II.
  - O art. 30 tira o MEMBRO dos sorteios e, por extensão, da contemplação obrigatória. Esse ponto precisa ser ratificado (§3.4, art. 14, p.u.).
- **Default:**
  - Quem está em atraso ou postergado **é contemplado**; a dívida continua (art. 28).
  - Quem está **impossibilitado** deixa a rodada `SEM_CONTEMPLADO` até uma ATA:
    - `PERMANENCIA_ART30` aprovada → a pessoa sai e o ciclo conclui;
    - `RETORNO_SORTEIOS` → a pessoa é contemplada;
    - `PERMANENCIA_ART30` rejeitada → a rodada segue `SEM_CONTEMPLADO` até `RETORNO_SORTEIOS` ou outro caso omisso.

### D-06 — Mês sem nenhum elegível **[DECIDIR]**

- **Casos:** todos optaram por não concorrer, estão postergados à espera dos demais ou estão fora de dia.
- **Default:** a rodada fica `SEM_CONTEMPLADO`, **sem contribuições**: não há a quem pagar, e o art. 3º, p.u. veda guardar valores. O ciclo ganha um mês (art. 2º, III prevalece sobre o art. 4º) e a SOBRA espera. Depois de 2 rodadas vazias seguidas, o sistema pede deliberação.
- **Contraria:** o art. 5º, §1º ("todos os meses"). Por isso vai para o texto (§3.4).

### D-07 — PRÊMIO nominal ou recebido **[DECIDIR]**

- **Texto:** "soma das contribuições mensais **destinadas** ao SORTEADO" (art. 2º, V).
- **Default:** **nominal (devidas)**. A SOBRA é calculada sobre o valor devido. Se alguém não paga, o sorteado adianta a parte e fica credor do inadimplente (art. 28).
- **Alternativa:** "recebido", mais protetora para o sorteado. Exige cascata de sobras e precisa estar no texto.

### D-08 — Postergação (art. 29) **[DECIDIR]**

- **Default:**
  1. **Pegajosa dentro do ciclo:** pagar depois não remove a postergação. Se removesse, o art. 10, III repetiria o II.
  2. Passa para o ciclo seguinte só se a pessoa o começar com contribuição vencida em aberto.
  3. Postergados concorrem entre si, com chance igual, quando não restam normais não contemplados.
     - Um normal que optou por não concorrer **bloqueia** os postergados (leitura estrita).
     - Um **IMPOSSIBILITADO** (excluído dos sorteios, art. 30) **não** conta entre os "demais" e não bloqueia.
  4. Atraso de SOBRA, repasse ou rateio **não** posterga.
- **Lacuna:** o contemplado que atrasa não sofre efeito além da dívida. Para puni-lo, é preciso escrever no texto.

### D-09 — Prazo de 30 dias (art. 20) vencido sem compra **[DECIDIR]**

- **Texto:** não diz a consequência.
- **Default:**
  - A rodada ganha a pendência `PRAZO_COMPRA_VENCIDO` até que:
    - uma compra seja registrada, mesmo depois do prazo: ela entra marcada `APOS_PRAZO` e fecha a rodada; **ou**
    - uma ATA `CONVERTER_PREMIO_EM_SOBRA` seja aprovada.
  - Nada é convertido automaticamente.
- **Custo:** enquanto a pendência existir, a rodada **trava o fechamento em cadeia** das seguintes (RN-FIN-13). As sobras delas não nascem, porque o prêmio de cada uma depende da anterior.
- **Recomendação:** escrever no texto "o PRÊMIO não utilizado no prazo converte-se integralmente em SOBRA" (§3.3). Com isso, o tick fecha a rodada sozinho, com gasto 0, e o travamento desaparece.

### D-10 — Compra irregular

- **Casos:** sem aviso, antes da autorização, durante o veto ou a cessão, jogo bloqueado, fora do prazo, sem 16 IV, conta errada.
- **Default:** a compra entra no gasto, leva a marca de irregular e gera pendência de caso omisso. Não há sanção inventada. A compra **anterior ao sorteio** é recusada.

### D-11 — Um produto por contemplação **[DECIDIR]**

- **Texto:** sempre "o jogo", no singular (arts. 16, 20 e 22 a 26).
- **Default:** 1 produto (jogo, DLC ou pacote vendido como item único). Mais de um, só por ATA.

### D-12 — Cessão da vez: pagamentos, prazo e aceite **[DECIDIR]**

- **Default:**
  - Paga-se ao sorteado original no dia do sorteio (art. 11). Aprovada a cessão, ele repassa cada valor recebido ao cessionário (RN-CES-05).
  - O prazo do art. 20 conta do sorteio original.
  - A cessão exige aceite do beneficiário, que não pode estar impossibilitado.
  - Faltando menos de 96 h para o prazo, exige ciência explícita; com o prazo já vencido, a cessão é vedada.
  - São permitidas cessões sucessivas, uma de cada vez.
  - O cedente pode retirar a proposta **até a aprovação, mesmo depois de votos de outros membros**. A votação é cancelada sem ATA numerada, como exceção à RN-VOT-05.
- **Custo aceito:** o cedente guarda valores de terceiros durante o aceite e a votação (até 48 h) e, depois da aprovação, até o repasse: fim do dia da ATA, ou +7 dias com justificativa. Há tensão com o art. 3º, p.u., menor quando a cessão é convocada logo após o sorteio.
- **Alternativa:** suspender os pagamentos durante a votação. Exige texto.

### D-13 — Impossibilidade de pagamento (art. 30) **[DECIDIR]**

- **Default:**
  - A autodeclaração vale na hora e só pode ser feita pelo próprio membro, nunca transcrita.
  - A "demonstração" por terceiros, ou a declaração feita só no GRUPO, depende de ATA.
  - A votação é formulada como "**excluir?**": a falta de quórum mantém a pessoa.
  - O interessado **não vota**, mas o quórum é sobre o total de MEMBROS.
  - Excluir da família implica excluir do consórcio.
  - As contribuições continuam até ATA de suspensão, e a volta aos sorteios só acontece por ATA.

### D-14 — Regras gerais de votação

- **Default:**
  - **Quórum:** votos **favoráveis** ≥ floor(N/2)+1, com N = membros `ATIVO` + `IMPOSSIBILITADO` congelados na convocação. `AGUARDANDO_CICLO` não conta até o corte do ciclo de ingresso (art. 6º).
  - **Encerramento:** a votação encerra antes do prazo ao atingir o quórum e também quando a aprovação fica **matematicamente impossível**.
  - **Voto:** irretratável; a abstenção não aprova.
  - **Interessado:** vota, exceto o alvo do art. 30.
  - **ATA:** **toda** votação encerrada gera ATA numerada (art. 2º, VIII e o "Rejeitado" do Anexo II).
  - **Formulação:** a proposição é sempre de mudança, e rejeitar mantém o status quo. O veto não pode ser cancelado nem fica prejudicado.
- **Ratificar:** a rejeição antecipada é inferência lógica, não texto literal (§3.5).

### D-15 — Veto e Anexo I **[DECIDIR]**

- **Default:**
  - **Vigência:** o bloqueio vale **imediatamente**, inclusive no restante do ciclo corrente. A leitura "só ciclos seguintes" permitiria a outro sorteado comprar o jogo vetado no mês seguinte.
  - **Limite:** uma votação de veto por aviso. Desistir do aviso não cancela o veto.
  - **Autorização:** sem veto convocado, não há autorização antes das 48 h. O veto rejeitado autoriza no seu encerramento (art. 23, §2º).
  - **Abrangência:** o bloqueio cobre o appId do aviso e os pacotes que o contêm. O veto de um PACOTE bloqueia o pacote e cada item incluído. Edições e DLCs relacionadas só geram alerta.
- **Contraria:** o art. 23, §4º ("ciclos seguintes"). Por isso vai para o texto (§3.3).

### D-16 — Número de membros diferente de 5

- **Default:**
  - Abaixo de 5 (saídas, não confirmações): proporcional (prêmio = 25 × N, duração de N meses, quórum de N), com alerta.
  - Acima de 5: exige alteração vigente no início do ciclo (`membrosPrevistos`).
  - O ciclo seguinte exige ao menos 2 participantes.

### D-17 — Confirmação para o ciclo seguinte (art. 44) **[DECIDIR]**

- **Default:**
  - O próximo ciclo começa no primeiro dia 3 ≥ conclusão + 8 dias, o que dá **uma janela mínima de 7 dias**.
  - O prazo de confirmação é o **fim do dia 2** do mês de início.
  - O silêncio vale como não participação, porque o texto exige confirmação "expressamente".
  - Quem não confirma continua MEMBRO até o 1º corte e continua na família.
- **Efeito grave:** quem fica em silêncio perde o vínculo de MEMBRO e, para voltar, precisa de nova admissão (art. 6º).

### D-18 — Rateio da SOBRA sem ciclo seguinte (art. 25, §3º)

- **Default:**
  - **Quem entra:** os participantes do ciclo encerrado que não saíram antes da conclusão, **inclusive quem não confirmou o ciclo seguinte e os impossibilitados**. O detentor entra só se estiver entre eles.
  - **Divisão:** cada um recebe `floor(S/k)`. O resto vai 1 centavo por pessoa, pela ordem de contemplação e, depois, dos não contemplados por id. Cota zero não gera obrigação.
  - **Gatilho:** menos de 2 participantes no ciclo seguinte, ou ATA de encerramento.

### D-19 — Pagamentos

- **Default:**
  - Vale o **horário do Pix** no comprovante.
  - O comprovante é obrigatório, **exceto em forma diversa** (dinheiro, conta de terceiro), que só conta com confirmação.
  - Quem **recebeu** o Pix é quem confirma ou contesta; só o **devedor** cancela.
  - Pagamento **contestado conta como pago** para "em dia" até a decisão.
  - Não há confirmação tácita.
  - Só a CONTRIBUIÇÃO afeta "em dia".

### D-20 — Vigência de alteração do Regulamento (art. 42)

- **Default:** 00:00 do **dia 1º do mês civil seguinte** à aprovação. A votação é regida pela versão vigente na convocação. Se a alteração mudar o valor da contribuição no meio do ciclo, o sistema alerta e sugere "vigência a partir do próximo ciclo" no próprio texto.

### D-21 — Forma da assinatura

- **Default:** aceite eletrônico autenticado pela Steam, com hash do texto e declaração literal. PDF gov.br é anexo opcional. Novas versões não exigem reassinatura. _Não é parecer jurídico._

### D-22 — Contagem de prazos

- **Default:** dias corridos excluem o dia inicial e vencem no fim do dia final (analogia com o art. 132 do CC). Horas contam de instante a instante. Fuso `America/Sao_Paulo`.

### D-23 — Lista de desejos e "escolher dentre eles" (art. 15)

- **Default:** não bloqueia. A origem do jogo fica visível a todos, e o veto é o controle.

### D-24 — DLC cosmética, moedas, itens e trilha sonora (art. 18 × art. 19, III)

- **Default:** alerta + declaração do sorteado; o grupo decide pelo veto. Trilha sonora (`type = music`) é DLC não lúdica e recebe o mesmo tratamento.

### D-25 — Vencimento da SOBRA

- **Texto:** "no prazo previsto no art. 11", isto é, no dia do sorteio seguinte. Mas o prazo de compra pode cair no dia 3 seguinte ou depois dele (03/11 → 03/12; 03/02/2027 → 05/03/2027).
- **Default:** vence no mais tardio entre o sorteio da rodada destino e o fechamento da rodada de origem, +7 com justificativa. Uma rodada só fecha depois que a anterior contemplada fechou.

### D-26 — Plataforma do GRUPO **[DECIDIR]**

- **Pergunta:** WhatsApp, Discord ou Telegram?
- **Default:** texto para copiar, que funciona em qualquer plataforma. No Discord ou no Telegram, um webhook de publicação automática custa pouco (fase posterior).

### D-27 — Reembolso sem reabertura da rodada

- **Default:**
  - A diferença vira SOBRA complementar para a rodada contemplada mais recente ainda não fechada, sem cascata.
  - Se não houver ciclo seguinte, a diferença é rateada (D-18).
  - A reabertura só vale no prazo, com a SOBRA não paga e o destino não fechado (RN-FIN-13).

### D-28 — Anulação de sorteio

- **Default:**
  - Só por ATA, sem aquisição registrada, com o ciclo em andamento e sem rodada posterior já executada.
  - A substituta herda a sequência e o mês da rodada anulada e é sorteada às 12:00 do dia seguinte à ATA.
  - Todas as obrigações da rodada anulada, exceto devoluções, são canceladas, e cada valor pago volta como devolução.
  - A SOBRA recebida pela rodada anulada é recriada para a substituta.
  - As declarações de não concorrer e as justificativas são copiadas para a substituta.

### D-29 — Hospedagem e operadores **[DECIDIR]**

- **Pergunta:** quem hospeda e onde?
- **Default:** container Docker + Postgres numa VPS pequena, ou PaaS com cron a cada 5 min (doc 08).
- **Recomendação:** pelo menos 2 membros com acesso à infraestrutura, nomeados em ATA de caso omisso, que também registre que eles não têm poder de negócio.

### D-30 — Art. 36 desatualizado frente às regras atuais da Steam

- **Fatos (FAQ oficial, 24/09/2026):**
  - o dono **não tem prioridade** sobre a cópia em uso (o art. 36, I diz o contrário);
  - o cooldown de 1 ano conta da **entrada** na família anterior, e é possível voltar à última família sem espera se houver vaga;
  - o limite é de 6 membros;
  - F2P, jogos com conta ou assinatura de terceiros e jogos com opt-out do publisher não são compartilháveis.
- **Default:** o sistema segue a regra atual da Steam, com a vaga bloqueada contada da entrada (RN-CAD-11), e não a letra do art. 36, II. Recomenda-se corrigir o art. 36 na v1.0 (§3.6).

### D-31 — Categoria _Family Sharing_ ausente (art. 16, I) **[DECIDIR]**

- **Texto:** o jogo deve "obrigatoriamente" ser compartilhável.
- **Default:** se a categoria 62 não aparece nos dados da Steam, o sistema emite **alerta** e exige declaração **e** evidência (V6). O motivo é que a categoria pode faltar em DLCs e chaves externas; o controle efetivo é o veto.
- **Alternativa literal:** BLOQUEIO, desbloqueável por caso omisso `DESBLOQUEAR_COMPARTILHAMENTO {appId}`, efeito a acrescentar ao catálogo.

### D-32 — Regras operacionais sem texto expresso

- Caducidade da admissão sem assinatura até o prazo de confirmação (RN-CAD-12.5).
- Uma votação `ALTERACAO_REGULAMENTO` aberta por vez (RN-REG-04).
- Prorrogação sempre pelo máximo de 7 dias, estendida a todos os tipos de obrigação por analogia com o art. 25 (RN-FIN-03).
- Bloqueio do aviso durante a cessão em andamento e compra irregular durante a votação da cessão (RN-CES-04).

## 2. As decisões que os membros precisam tomar (resumo)

| #   | Pergunta                                                                  | Recomendação                                         |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | O sistema vira o registro oficial no lugar do GRUPO e da planilha? (D-01) | Sim, ajustando a v1.0 antes de assinar (§3.1)        |
| 2   | Data do 1º ciclo (D-02)                                                   | "Primeiro dia 3 após a última assinatura"            |
| 3   | Horário do sorteio (D-03)                                                 | 12:00, automático                                    |
| 4   | Último não contemplado em atraso ou impossibilitado (D-05)                | Em atraso é contemplado; impossibilitado espera ATA  |
| 5   | Mês sem elegíveis (D-06)                                                  | Sem sorteio e sem contribuição; o ciclo ganha um mês |
| 6   | Prêmio nominal ou recebido (D-07)                                         | Nominal                                              |
| 7   | Postergação e contemplado que atrasa (D-08)                               | Pegajosa; avaliar punição no texto                   |
| 8   | 30 dias sem compra (D-09)                                                 | Converter em SOBRA (escrever no texto)               |
| 9   | Um ou vários jogos por prêmio (D-11)                                      | Um                                                   |
| 10  | Pagamentos durante a cessão (D-12)                                        | Pagar ao sorteado original, que repassa              |
| 11  | Art. 30: formulação e volta aos sorteios (D-13)                           | "Excluir?"; volta só por ATA                         |
| 12  | Veto vale já no ciclo corrente? (D-15)                                    | Sim (escrever no texto)                              |
| 13  | Janela mínima de confirmação e efeito do silêncio (D-17)                  | 7 dias; silêncio = não participa                     |
| 14  | Categoria _Family Sharing_ ausente (D-31)                                 | Alerta com evidência                                 |
| 15  | Plataforma do GRUPO e hospedagem (D-26, D-29)                             | —                                                    |

## 3. Propostas de redação para a v1.0 (antes das assinaturas)

São textos prontos para colar. Cada um tira uma ambiguidade que, sem ele, vira pendência de ATA ou contraria a letra.

### 3.1 Sistema como registro oficial (D-01)

> **Art. 2º, X** – SISTEMA: a aplicação web adotada pelos MEMBROS para o controle do CONSÓRCIO, acessível a todos os MEMBROS, com exportação integral dos dados.
>
> **Art. 39.** O controle do CONSÓRCIO será feito no SISTEMA, que registra os pagamentos, os sorteios, os jogos adquiridos, as SOBRAS, os vetos, as votações e as ATAS.
>
> **Art. 40.** Considera-se publicado no GRUPO o ato, a declaração, o comprovante ou a votação registrada no SISTEMA, que disponibilizará texto e link para divulgação no GRUPO. Valem também, publicadas no GRUPO, a declaração do art. 12, a confirmação ou recusa do art. 44 e a justificativa do parágrafo único do art. 11, que qualquer MEMBRO poderá registrar no SISTEMA com a captura de tela da mensagem: antes do sorteio a que se referem, no caso do art. 12; até o fim do prazo de confirmação, no caso do art. 44; e em até 48 (quarenta e oito) horas do fim do prazo de pagamento, no caso do art. 11. A saída e a impossibilidade de pagamento declaradas no GRUPO só produzem efeito quando registradas no SISTEMA pelo próprio MEMBRO, em até 48 (quarenta e oito) horas da mensagem, e a partir desse registro. O comprovante de pagamento pode ser registrado no SISTEMA por qualquer MEMBRO. Os demais atos, inclusive votos, avisos e comprovantes de compra, só valem quando praticados no SISTEMA pelo próprio autor.
>
> **Art. 41.** Qualquer MEMBRO poderá convocar votação no SISTEMA (…).

### 3.2 Sorteio (D-03, D-04)

> **Art. 9º** O sorteio será realizado pelo SISTEMA às 12h (horário de Brasília) do dia 3, com a lista de concorrentes congelada e publicada, valendo a página de resultado como registro do sorteio. Não realizado no horário, qualquer MEMBRO poderá realizá-lo no SISTEMA na primeira oportunidade, contando-se os prazos a partir da data em que efetivamente ocorrer.

### 3.3 Compra, veto e produto (D-09, D-11, D-15)

> **Art. 16, parágrafo único.** O PRÊMIO destina-se à aquisição de um único produto (jogo, DLC ou pacote vendido como item único), salvo aprovação por QUÓRUM.
>
> **Art. 20, parágrafo único.** Decorrido o prazo sem aquisição, o PRÊMIO converte-se integralmente em SOBRA, nos termos do art. 25.
>
> **Art. 23, § 4º** Aprovado o veto, será lavrada ATA, e o jogo será incluído na Lista de Jogos Bloqueados (Anexo I), que integra este Regulamento e vale a partir da lavratura da ATA, inclusive no CICLO em curso e nos seguintes.

### 3.4 Omissões do sorteio (D-05, D-06, D-08)

> **Art. 10-A.** Não havendo MEMBRO apto a concorrer em determinado mês, não haverá SORTEADO nem contribuição naquele mês, e o CICLO será acrescido de um mês.
>
> **Art. 14, parágrafo único.** A contemplação obrigatória independe de o MEMBRO estar em atraso, subsistindo a dívida, e não se aplica ao MEMBRO excluído dos sorteios nos termos do art. 30.
>
> **Art. 29, parágrafo único.** A postergação perdura até o fim do CICLO, ainda que o débito seja quitado, e estende-se ao CICLO seguinte se houver contribuição vencida em aberto no seu início.

### 3.5 Cessão, votação e confirmação (D-12, D-14, D-17)

> **Art. 13:** o parágrafo único passa a § 1º, acrescentando-se o § 2º: "As contribuições do mês serão pagas ao SORTEADO original; aprovada a cessão, ele transferirá ao novo contemplado os valores recebidos até o fim do dia da aprovação, prorrogável nos termos do parágrafo único do art. 11, contando-se o prazo do art. 20 da data do sorteio."
>
> **Art. 41:** o parágrafo único passa a § 1º, acrescentando-se o § 2º: "Considera-se rejeitada a votação quando a aprovação se tornar matematicamente impossível. O voto é irretratável, e toda votação encerrada gera ATA numerada."
>
> **Art. 44, parágrafo único.** O CICLO seguinte terá início no primeiro dia 3 que diste ao menos 8 (oito) dias do término do anterior, e a confirmação deverá ser feita até o dia 2 do mês desse início; o silêncio equivale à não participação.

### 3.6 Regras da Steam (D-30) e início (D-02)

> **Art. 36, I** – cada cópia de jogo pode ser utilizada por um único integrante por vez, **não havendo prioridade do titular** enquanto outro integrante a estiver utilizando;
>
> **Art. 36, II** – o integrante que sai da FAMÍLIA STEAM pode ficar impedido de ingressar em outra família por até 1 (um) ano, e a vaga deixada pode permanecer bloqueada pelo mesmo período, conforme as regras da plataforma;
>
> **Art. 46.** (…) iniciando-se o primeiro CICLO no primeiro dia 3 posterior à data da última assinatura.

## 4. Como uma decisão muda o sistema

- **Antes da assinatura:** o texto muda em `docs/regulamento/regulamento-v1.0.md`, junto com o default correspondente nesta spec. O bootstrap (RN-ACE-10) só roda com o texto final, que já traz as redações do §3 escolhidas. Sem o §3.1, vale a atenção da D-01.
- **Depois da vigência:** alteração pelo art. 42, que gera uma nova `VersaoRegulamento`. Se a mudança não for parâmetro (RN-REG-06), abre-se tarefa de código com prazo até a vigência.
- **Caso pontual:** ATA de caso omisso com efeito tipado (RN-VOT-09). A primeira ATA (antes do 1º sorteio) ratifica as omissões puras que restarem e nomeia os operadores (D-29).
