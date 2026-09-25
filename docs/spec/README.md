# Spec — Controle do Consórcio da Família Steam

Sistema web que substitui a "planilha compartilhada" do art. 39 do Regulamento e conduz os processos do consórcio: cadastros, sorteio mensal, contribuições por Pix, prêmio e sobra, aviso prévio e veto de jogos, votações com ATA, Lista de Jogos Bloqueados e integração com a Steam (login, bibliotecas e listas de desejos).

- **Fonte normativa:** [`docs/regulamento/regulamento-v1.0.md`](../regulamento/regulamento-v1.0.md), a minuta ainda não assinada.
- **Data-base da análise:** 24/09/2026. Fuso de negócio: `America/Sao_Paulo`.
- **Status:** rascunho 3. Passou por duas revisões adversariais: na 1ª, 139 achados confirmados; na 2ª, 45 regressões e casos-limite. Todos foram aplicados. O schema foi validado com `prisma validate` 7.10.0 e as constraints SQL foram testadas em Postgres 17. As decisões marcadas **[DECIDIR]** em `03` precisam do aval dos membros.

## Documentos

| #   | Documento                                                    | Conteúdo                                                                                                         |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 01  | [Visão e escopo](01-visao-e-escopo.md)                       | Objetivo, atores, escopo, princípios e glossário (regulamento ↔ sistema)                                         |
| 02  | [Regras de negócio](02-regras-de-negocio.md)                 | Todas as regras (RN-xxx), com artigo de origem, algoritmos e máquinas de estado                                  |
| 03  | [Decisões de interpretação](03-decisoes-de-interpretacao.md) | Omissões e ambiguidades do texto, default adotado, alternativas e propostas de redação para a v1.0               |
| 04  | [Acessos e perfis](04-acessos-e-perfis.md)                   | Perfis, matriz de permissões, login Steam, bootstrap sem administrador, privacidade                              |
| 05  | [Modelo de dados](05-modelo-de-dados.md)                     | Diagrama ER, schema Prisma, constraints e dados derivados                                                        |
| 06  | [Integração Steam](06-integracao-steam.md)                   | OpenID, Web API, Store API, sincronização, cache e validações dos arts. 15 a 19                                  |
| 07  | [Telas e rotas](07-telas-e-rotas.md)                         | Mapa de rotas, conteúdo e ações de cada tela, componentes, painel de pendências e textos para o GRUPO            |
| 08  | [Arquitetura e qualidade](08-arquitetura-e-qualidade.md)     | Stack e versões, ADRs, estrutura de pastas, padrões, lint, Prettier, testes, CI, jobs e deploy                   |
| 09  | [Cenários de aceitação](09-cenarios-de-aceitacao.md)         | Casos Dado/Quando/Então que viram testes                                                                         |
| 10  | [Plano de implementação](10-plano-de-implementacao.md)       | Marcos M0 a M9 com entregáveis e critérios de pronto                                                             |
| 11  | [Rastreabilidade](11-rastreabilidade.md)                     | Mapa artigo → regras → cenários                                                                                  |
| 12  | [Design e interface](12-design-e-interface.md)               | Identidade sóbria, tokens e contraste, tipografia, formulários, movimento, acessibilidade e padronização (UI-nn) |
| 13  | [Performance e dados](13-performance-e-dados.md)             | N+1, retrato do ciclo, transações, pool, cache do Next, Steam em lote, índices e teste de constância (DP-nn)     |
| 14  | [Segurança](14-seguranca.md)                                 | Ameaças, autorização por action, sessão, CSP, papéis do banco, supply chain e mapa OWASP (SEG-nn)                |

## Como ler

- **RN-XXX-nn** é uma regra de negócio. O prefixo indica o módulo: GER (geral), CAD (cadastros), CIC (ciclo), SOR (sorteio), FIN (financeiro), CES (cessão), COM (compra), VOT (votação), BLO (Anexo I), REG (regulamento), SAI (saída e art. 30), STM (Steam), ACE (acessos).
- **D-nn** é uma decisão de interpretação (doc 03). Uma regra que depende de interpretação cita a decisão.
- **CA-nn** é um cenário de aceitação (doc 09).
- **UI-nn**, **DP-nn** e **SEG-nn** são decisões técnicas de interface, dados e segurança (docs 12, 13 e 14).
- Termos em MAIÚSCULAS (MEMBRO, SORTEADO, SOBRA…) têm o sentido do art. 2º.
- "Fim do dia D" é o instante exclusivo `D+1 00:00:00` em `America/Sao_Paulo`.

## Resumo das decisões estruturais

1. **Next.js full-stack (monólito modular)**, sem React e Nest separados: uma app, um deploy, tipos de ponta a ponta. O domínio fica em TypeScript puro, portável (ADR-001).
2. **Sem administrador** (art. 3º). Todo poder coletivo passa por votação, e o efeito da votação é aplicado pelo sistema (RN-VOT, RN-ACE).
3. **Login só com Steam (OpenID 2.0)**, com lista de SteamIDs permitidos. Perfil, jogos e lista de desejos vêm da Steam Web API (doc 06).
4. **O sistema não guarda dinheiro.** Ele registra obrigações Pix entre pessoas, comprovantes e prazos (art. 3º, p.u.).
5. **Estados temporais são derivados do relógio** (atraso, postergação, janela de veto, votação vencida). Um job idempotente (`tick`) só materializa e executa o sorteio.
6. **Registros imutáveis e auditados.** Correções só por votação de caso omisso com efeito tipado.
