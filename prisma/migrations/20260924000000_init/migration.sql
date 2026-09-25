-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TipoChavePix" AS ENUM ('ALEATORIA', 'EMAIL', 'TELEFONE', 'CPF', 'CNPJ');

-- CreateEnum
CREATE TYPE "OrigemMembro" AS ENUM ('FUNDADOR', 'ADMISSAO');

-- CreateEnum
CREATE TYPE "StatusMembro" AS ENUM ('AGUARDANDO_ADESAO', 'AGUARDANDO_CICLO', 'ATIVO', 'IMPOSSIBILITADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "MotivoEncerramentoMembro" AS ENUM ('SAIDA_VOLUNTARIA', 'SAIDA_DA_FAMILIA', 'EXCLUSAO_ART30', 'EXCLUSAO_ART35', 'NAO_CONFIRMOU_ART44', 'ADMISSAO_CADUCOU');

-- CreateEnum
CREATE TYPE "OrigemIntegrante" AS ENUM ('PRE_EXISTENTE', 'CONVITE');

-- CreateEnum
CREATE TYPE "StatusIntegrante" AS ENUM ('CONVITE_AUTORIZADO', 'CONVITE_CADUCOU', 'ATIVO', 'REMOCAO_AUTORIZADA', 'REMOVIDO', 'SAIU');

-- CreateEnum
CREATE TYPE "StatusCiclo" AS ENUM ('PLANEJADO', 'EM_ANDAMENTO', 'EM_REVISAO', 'ENCERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusRodada" AS ENUM ('AGENDADA', 'CONTEMPLADA', 'SEM_CONTEMPLADO', 'FECHADA', 'ANULADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoContemplacao" AS ENUM ('SORTEIO', 'UNICO_ELEGIVEL', 'OBRIGATORIA_ART14');

-- CreateEnum
CREATE TYPE "MotivoSemContemplado" AS ENUM ('NENHUM_ELEGIVEL', 'ULTIMO_IMPOSSIBILITADO');

-- CreateEnum
CREATE TYPE "MotivoFechamento" AS ENUM ('AQUISICAO_CONCLUIDA', 'PRAZO_COM_AQUISICAO', 'TRANSFERIDO_COMO_SOBRA', 'CONVERTIDO_POR_ATA');

-- CreateEnum
CREATE TYPE "TipoDeclaracao" AS ENUM ('NAO_CONCORRER', 'JUSTIFICATIVA_PRORROGACAO', 'IMPOSSIBILIDADE_PAGAMENTO', 'SAIDA_CONSORCIO', 'SAIDA_FAMILIA', 'CONFIRMA_PROXIMO_CICLO', 'RECUSA_PROXIMO_CICLO');

-- CreateEnum
CREATE TYPE "StatusCessao" AS ENUM ('AGUARDANDO_ACEITE', 'EM_VOTACAO', 'APROVADA', 'REJEITADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoObrigacao" AS ENUM ('CONTRIBUICAO', 'SOBRA', 'REPASSE_CESSAO', 'RATEIO_SOBRA', 'DEVOLUCAO');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('DECLARADO', 'CONFIRMADO', 'CONTESTADO', 'INVALIDADO');

-- CreateEnum
CREATE TYPE "MotivoContestacao" AS ENUM ('NAO_RECEBIDO', 'VALOR_DIVERGENTE', 'DATA_DIVERGENTE');

-- CreateEnum
CREATE TYPE "TipoProduto" AS ENUM ('JOGO', 'DLC', 'PACOTE');

-- CreateEnum
CREATE TYPE "OrigemProduto" AS ENUM ('LOJA_STEAM', 'CHAVE_EXTERNA');

-- CreateEnum
CREATE TYPE "OrigemNaLista" AS ENUM ('LISTA_DO_SORTEADO', 'INCLUIDO_APOS_SORTEIO', 'LISTA_DE_OUTRO_MEMBRO', 'FORA_DAS_LISTAS');

-- CreateEnum
CREATE TYPE "VerificacaoBiblioteca" AS ENUM ('PENDENTE', 'VERIFICADO', 'NAO_ENCONTRADO', 'NAO_VERIFICAVEL');

-- CreateEnum
CREATE TYPE "IrregularidadeAquisicao" AS ENUM ('SEM_AVISO', 'ANTES_DA_AUTORIZACAO', 'DURANTE_VOTACAO_VETO', 'DURANTE_VOTACAO_CESSAO', 'APOS_PRAZO', 'JOGO_BLOQUEADO', 'PRODUTO_DIFERENTE_DO_AVISO', 'SEGUNDA_AQUISICAO', 'SEM_AUTORIZACAO_16IV', 'CONTA_DIFERENTE_DO_CONTEMPLADO');

-- CreateEnum
CREATE TYPE "TipoBloqueio" AS ENUM ('CATEGORIA', 'JOGO');

-- CreateEnum
CREATE TYPE "AssuntoVotacao" AS ENUM ('VETO_JOGO', 'JOGO_DE_OUTRO_MEMBRO', 'EXCLUSAO_BLOQUEIO', 'CESSAO_VEZ', 'ADMISSAO_MEMBRO', 'CONVITE_INTEGRANTE', 'REMOCAO_INTEGRANTE', 'PERMANENCIA_ART30', 'CONTINUIDADE_CONSORCIO', 'ALTERACAO_REGULAMENTO', 'CASO_OMISSO', 'CONTROVERSIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusVotacao" AS ENUM ('ABERTA', 'APROVADA', 'REJEITADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "MotivoEncerramentoVotacao" AS ENUM ('QUORUM_ATINGIDO', 'APROVACAO_IMPOSSIVEL', 'PRAZO', 'CANCELADA_PELO_CONVOCANTE', 'PREJUDICADA');

-- CreateEnum
CREATE TYPE "OpcaoVoto" AS ENUM ('FAVOR', 'CONTRA', 'ABSTENCAO');

-- CreateEnum
CREATE TYPE "TipoAnexo" AS ENUM ('COMPROVANTE_PIX', 'COMPROVANTE_COMPRA', 'COMPROVANTE_REEMBOLSO', 'EVIDENCIA_SORTEIO', 'EVIDENCIA_GRUPO', 'EVIDENCIA_VALIDACAO', 'PRINT_BIBLIOTECA', 'ASSINATURA_PDF', 'OUTRO');

-- CreateEnum
CREATE TYPE "AtorTipo" AS ENUM ('MEMBRO', 'SISTEMA', 'OPERADOR');

-- CreateEnum
CREATE TYPE "OrigemItemDesejo" AS ENUM ('STEAM', 'MANUAL');

-- CreateTable
CREATE TABLE "pessoa" (
    "id" UUID NOT NULL,
    "nome" TEXT,
    "apelido" TEXT NOT NULL,
    "steamId64" VARCHAR(17),
    "steamNick" TEXT,
    "steamAvatarUrl" TEXT,
    "steamPerfilUrl" TEXT,
    "steamPerfilPublico" BOOLEAN,
    "steamJogosPublicos" BOOLEAN,
    "steamDesejosPublicos" BOOLEAN,
    "steamSincronizadoEm" TIMESTAMPTZ(3),
    "chavePix" TEXT,
    "tipoChavePix" "TipoChavePix",
    "chavePixAlteradaEm" TIMESTAMPTZ(3),
    "maioridadeDeclaradaEm" TIMESTAMPTZ(3),
    "anonimizadaEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membro" (
    "id" UUID NOT NULL,
    "pessoaId" UUID NOT NULL,
    "origem" "OrigemMembro" NOT NULL,
    "status" "StatusMembro" NOT NULL,
    "ataAdmissaoNumero" INTEGER,
    "impossibilitadoDesde" TIMESTAMPTZ(3),
    "ativadoEm" TIMESTAMPTZ(3),
    "encerradoEm" TIMESTAMPTZ(3),
    "motivoEncerramento" "MotivoEncerramentoMembro",
    "ataEncerramentoNumero" INTEGER,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrante_familia" (
    "id" UUID NOT NULL,
    "pessoaId" UUID NOT NULL,
    "steamId64" VARCHAR(17),
    "origem" "OrigemIntegrante" NOT NULL,
    "status" "StatusIntegrante" NOT NULL,
    "entrouEm" DATE,
    "saiuEm" DATE,
    "vagaBloqueadaAte" DATE,
    "justificativaVaga" TEXT,
    "ataConviteNumero" INTEGER,
    "ataRemocaoNumero" INTEGER,
    "execucaoRegistradaPorId" UUID,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrante_familia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versao_regulamento" (
    "id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "textoMarkdown" TEXT NOT NULL,
    "parametros" JSONB NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "resumoAlteracoes" TEXT,
    "ataNumero" INTEGER,
    "aprovadaEm" TIMESTAMPTZ(3),
    "vigenteDesde" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versao_regulamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adesao" (
    "id" UUID NOT NULL,
    "pessoaId" UUID NOT NULL,
    "versaoId" UUID NOT NULL,
    "sha256Versao" CHAR(64) NOT NULL,
    "nome" TEXT NOT NULL,
    "steamNick" TEXT NOT NULL,
    "codigoAmigo" TEXT NOT NULL,
    "chavePixMascarada" TEXT NOT NULL,
    "declaracao" TEXT NOT NULL,
    "assinadaEm" TIMESTAMPTZ(3) NOT NULL,
    "anexoPdfId" UUID,

    CONSTRAINT "adesao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciclo" (
    "id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "dataInicio" DATE NOT NULL,
    "status" "StatusCiclo" NOT NULL,
    "concluidoEm" TIMESTAMPTZ(3),
    "encerradoEm" TIMESTAMPTZ(3),
    "semCicloSeguinte" BOOLEAN NOT NULL DEFAULT false,
    "ataEncerramentoNumero" INTEGER,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ciclo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participacao_ciclo" (
    "id" UUID NOT NULL,
    "cicloId" UUID NOT NULL,
    "pessoaId" UUID NOT NULL,
    "entrouEm" TIMESTAMPTZ(3) NOT NULL,
    "saiuEm" TIMESTAMPTZ(3),
    "contribuicoesSuspensas" BOOLEAN NOT NULL DEFAULT false,
    "ataSuspensaoNumero" INTEGER,

    CONSTRAINT "participacao_ciclo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rodada" (
    "id" UUID NOT NULL,
    "cicloId" UUID NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "mesReferencia" CHAR(7) NOT NULL,
    "agendadaPara" TIMESTAMPTZ(3) NOT NULL,
    "status" "StatusRodada" NOT NULL DEFAULT 'AGENDADA',
    "executadaEm" TIMESTAMPTZ(3),
    "dataSorteio" DATE,
    "atrasada" BOOLEAN NOT NULL DEFAULT false,
    "tipoContemplacao" "TipoContemplacao",
    "motivoSemContemplado" "MotivoSemContemplado",
    "sorteadoOriginalId" UUID,
    "contempladoId" UUID,
    "versaoRegulamentoId" UUID,
    "contribuicaoCentavos" INTEGER,
    "pagantesNoCorte" INTEGER,
    "prazoCompraAte" TIMESTAMPTZ(3),
    "fechamentoSolicitado" "MotivoFechamento",
    "fechamentoSolicitadoEm" TIMESTAMPTZ(3),
    "multiplasAquisicoesAtaNumero" INTEGER,
    "fechadaEm" TIMESTAMPTZ(3),
    "motivoFechamento" "MotivoFechamento",
    "gastoCentavos" INTEGER,
    "sobraCentavos" INTEGER,
    "rodadaAnuladaId" UUID,
    "anuladaEm" TIMESTAMPTZ(3),
    "ataAnulacaoNumero" INTEGER,
    "criadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rodada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sorteio" (
    "id" UUID NOT NULL,
    "rodadaId" UUID NOT NULL,
    "corteEm" TIMESTAMPTZ(3) NOT NULL,
    "disparadoPorId" UUID,
    "algoritmoVersao" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotSha256" CHAR(64) NOT NULL,
    "elegiveisIds" UUID[],
    "indice" INTEGER,
    "contempladoId" UUID,

    CONSTRAINT "sorteio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaracao" (
    "id" UUID NOT NULL,
    "tipo" "TipoDeclaracao" NOT NULL,
    "pessoaId" UUID NOT NULL,
    "rodadaId" UUID,
    "obrigacaoId" UUID,
    "cicloId" UUID,
    "texto" TEXT,
    "efetivaEm" TIMESTAMPTZ(3) NOT NULL,
    "registradaEm" TIMESTAMPTZ(3) NOT NULL,
    "registradaPorId" UUID NOT NULL,
    "evidenciaAnexoId" UUID,
    "revogadaEm" TIMESTAMPTZ(3),

    CONSTRAINT "declaracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cessao" (
    "id" UUID NOT NULL,
    "rodadaId" UUID NOT NULL,
    "cedenteId" UUID NOT NULL,
    "beneficiarioId" UUID NOT NULL,
    "status" "StatusCessao" NOT NULL,
    "cienciaPrazo" BOOLEAN NOT NULL DEFAULT false,
    "propostaEm" TIMESTAMPTZ(3) NOT NULL,
    "aceitaEm" TIMESTAMPTZ(3),
    "encerradaEm" TIMESTAMPTZ(3),
    "votacaoId" UUID,

    CONSTRAINT "cessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obrigacao" (
    "id" UUID NOT NULL,
    "tipo" "TipoObrigacao" NOT NULL,
    "rodadaId" UUID NOT NULL,
    "rodadaOrigemId" UUID,
    "pagamentoOrigemId" UUID,
    "aquisicaoReembolsoId" UUID,
    "devedorId" UUID NOT NULL,
    "credorId" UUID NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "vencimentoEm" TIMESTAMPTZ(3) NOT NULL,
    "autoquitada" BOOLEAN NOT NULL DEFAULT false,
    "justificativa" TEXT,
    "justificadaEm" TIMESTAMPTZ(3),
    "canceladaEm" TIMESTAMPTZ(3),
    "motivoCancelamento" TEXT,
    "ataNumero" INTEGER,
    "criadaEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "obrigacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamento" (
    "id" UUID NOT NULL,
    "obrigacaoId" UUID NOT NULL,
    "recebedorId" UUID NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "pixEm" TIMESTAMPTZ(3) NOT NULL,
    "chavePixDestinoMascarada" TEXT,
    "formaDiversa" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusPagamento" NOT NULL,
    "comprovanteId" UUID,
    "registradoPorId" UUID NOT NULL,
    "registradoEm" TIMESTAMPTZ(3) NOT NULL,
    "confirmadoEm" TIMESTAMPTZ(3),
    "contestadoEm" TIMESTAMPTZ(3),
    "motivoContestacao" "MotivoContestacao",
    "detalheContestacao" TEXT,
    "invalidadoEm" TIMESTAMPTZ(3),
    "ataNumero" INTEGER,

    CONSTRAINT "pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aviso_compra" (
    "id" UUID NOT NULL,
    "rodadaId" UUID NOT NULL,
    "contempladoId" UUID NOT NULL,
    "appId" INTEGER NOT NULL,
    "pacoteId" INTEGER,
    "appIdsIncluidos" INTEGER[],
    "nome" TEXT NOT NULL,
    "tipo" "TipoProduto" NOT NULL,
    "origem" "OrigemProduto" NOT NULL,
    "lojaExterna" TEXT,
    "precoReferenciaCentavos" INTEGER,
    "origemNaLista" "OrigemNaLista" NOT NULL,
    "validacoes" JSONB NOT NULL,
    "declaracoes" JSONB NOT NULL,
    "snapshotSteam" JSONB,
    "declarantesPosseIds" UUID[],
    "avisadoEm" TIMESTAMPTZ(3) NOT NULL,
    "janelaVetoAte" TIMESTAMPTZ(3) NOT NULL,
    "substituidoEm" TIMESTAMPTZ(3),

    CONSTRAINT "aviso_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aquisicao" (
    "id" UUID NOT NULL,
    "rodadaId" UUID NOT NULL,
    "avisoId" UUID,
    "appId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "compradaEm" TIMESTAMPTZ(3) NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "comprovanteId" UUID NOT NULL,
    "contaSteamId64" VARCHAR(17) NOT NULL,
    "preVenda" BOOLEAN NOT NULL DEFAULT false,
    "irregularidades" "IrregularidadeAquisicao"[],
    "verificacaoBiblioteca" "VerificacaoBiblioteca" NOT NULL DEFAULT 'PENDENTE',
    "compartilhamentoPerdidoEm" TIMESTAMPTZ(3),
    "registradaPorId" UUID NOT NULL,
    "registradaEm" TIMESTAMPTZ(3) NOT NULL,
    "reembolsoValorCentavos" INTEGER,
    "reembolsadaEm" TIMESTAMPTZ(3),
    "reembolsoRegistradoEm" TIMESTAMPTZ(3),
    "reembolsoComprovanteId" UUID,
    "complementarCentavos" INTEGER,
    "regularizadaAtaNumero" INTEGER,

    CONSTRAINT "aquisicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jogo_bloqueado" (
    "numero" INTEGER NOT NULL,
    "tipo" "TipoBloqueio" NOT NULL,
    "nome" TEXT NOT NULL,
    "appIds" INTEGER[],
    "dataVeto" DATE,
    "origemTexto" TEXT,
    "motivo" TEXT NOT NULL,
    "ataInclusaoNumero" INTEGER,
    "protegida" BOOLEAN NOT NULL DEFAULT false,
    "excluidoEm" TIMESTAMPTZ(3),
    "ataExclusaoNumero" INTEGER,

    CONSTRAINT "jogo_bloqueado_pkey" PRIMARY KEY ("numero")
);

-- CreateTable
CREATE TABLE "votacao" (
    "id" UUID NOT NULL,
    "assunto" "AssuntoVotacao" NOT NULL,
    "proposicao" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "efeito" JSONB NOT NULL,
    "chaveObjeto" TEXT NOT NULL,
    "convocadaPorId" UUID NOT NULL,
    "abertaEm" TIMESTAMPTZ(3) NOT NULL,
    "encerraEm" TIMESTAMPTZ(3) NOT NULL,
    "eleitoresIds" UUID[],
    "impedidosIds" UUID[],
    "n" INTEGER NOT NULL,
    "quorum" INTEGER NOT NULL,
    "versaoRegulamentoId" UUID NOT NULL,
    "status" "StatusVotacao" NOT NULL DEFAULT 'ABERTA',
    "encerradaEm" TIMESTAMPTZ(3),
    "motivoEncerramento" "MotivoEncerramentoVotacao",
    "efeitoAplicadoEm" TIMESTAMPTZ(3),
    "efeitoNaoAplicavel" TEXT,

    CONSTRAINT "votacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voto" (
    "votacaoId" UUID NOT NULL,
    "pessoaId" UUID NOT NULL,
    "opcao" "OpcaoVoto" NOT NULL,
    "votadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "voto_pkey" PRIMARY KEY ("votacaoId","pessoaId")
);

-- CreateTable
CREATE TABLE "ata" (
    "numero" INTEGER NOT NULL,
    "votacaoId" UUID NOT NULL,
    "data" DATE NOT NULL,
    "markdown" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "retificaAtaNumero" INTEGER,
    "geradaEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ata_pkey" PRIMARY KEY ("numero")
);

-- CreateTable
CREATE TABLE "anexo" (
    "id" UUID NOT NULL,
    "tipo" "TipoAnexo" NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "conteudo" BYTEA,
    "linkExterno" TEXT,
    "entidade" TEXT,
    "entidadeId" UUID,
    "enviadoPorId" UUID NOT NULL,
    "enviadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_auditoria" (
    "id" SERIAL NOT NULL,
    "ocorridoEm" TIMESTAMPTZ(3) NOT NULL,
    "atorTipo" "AtorTipo" NOT NULL,
    "atorPessoaId" UUID,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "ataNumero" INTEGER,

    CONSTRAINT "evento_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle" (
    "chave" TEXT NOT NULL,
    "ate" TIMESTAMPTZ(3),
    "valor" JSONB,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "controle_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "sessao" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "pessoaId" UUID NOT NULL,
    "criadaEm" TIMESTAMPTZ(3) NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "revogadaEm" TIMESTAMPTZ(3),
    "userAgent" TEXT,

    CONSTRAINT "sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nonce_openid" (
    "nonce" TEXT NOT NULL,
    "usadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "nonce_openid_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "steam_app" (
    "appId" INTEGER NOT NULL,
    "nome" TEXT,
    "tipo" TEXT,
    "gratuito" BOOLEAN,
    "precoFinalCentavos" INTEGER,
    "categorias" INTEGER[],
    "descritoresConteudo" INTEGER[],
    "jogoBaseAppId" INTEGER,
    "emBreve" BOOLEAN,
    "imagemUrl" TEXT,
    "sucesso" BOOLEAN,
    "detalhesEm" TIMESTAMPTZ(3),
    "precoEm" TIMESTAMPTZ(3),
    "prioridadeSync" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "steam_app_pkey" PRIMARY KEY ("appId")
);

-- CreateTable
CREATE TABLE "jogo_possuido" (
    "pessoaId" UUID NOT NULL,
    "appId" INTEGER NOT NULL,
    "minutosJogados" INTEGER NOT NULL DEFAULT 0,
    "sincronizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jogo_possuido_pkey" PRIMARY KEY ("pessoaId","appId")
);

-- CreateTable
CREATE TABLE "item_lista_desejos" (
    "id" UUID NOT NULL,
    "pessoaId" UUID NOT NULL,
    "origem" "OrigemItemDesejo" NOT NULL,
    "appId" INTEGER,
    "tituloLivre" TEXT,
    "posicao" INTEGER NOT NULL,
    "prioridadeSteam" INTEGER,
    "adicionadoEm" TIMESTAMPTZ(3) NOT NULL,
    "observacao" TEXT,

    CONSTRAINT "item_lista_desejos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_steamId64_key" ON "pessoa"("steamId64");

-- CreateIndex
CREATE INDEX "membro_pessoaId_idx" ON "membro"("pessoaId");

-- CreateIndex
CREATE INDEX "integrante_familia_pessoaId_idx" ON "integrante_familia"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "versao_regulamento_ordem_key" ON "versao_regulamento"("ordem");

-- CreateIndex
CREATE UNIQUE INDEX "versao_regulamento_numero_key" ON "versao_regulamento"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "versao_regulamento_ataNumero_key" ON "versao_regulamento"("ataNumero");

-- CreateIndex
CREATE UNIQUE INDEX "adesao_pessoaId_versaoId_sha256Versao_codigoAmigo_key" ON "adesao"("pessoaId", "versaoId", "sha256Versao", "codigoAmigo");

-- CreateIndex
CREATE UNIQUE INDEX "ciclo_numero_key" ON "ciclo"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "participacao_ciclo_cicloId_pessoaId_key" ON "participacao_ciclo"("cicloId", "pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "rodada_rodadaAnuladaId_key" ON "rodada"("rodadaAnuladaId");

-- CreateIndex
CREATE INDEX "rodada_status_agendadaPara_idx" ON "rodada"("status", "agendadaPara");

-- CreateIndex
CREATE UNIQUE INDEX "sorteio_rodadaId_key" ON "sorteio"("rodadaId");

-- CreateIndex
CREATE INDEX "declaracao_pessoaId_tipo_idx" ON "declaracao"("pessoaId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "cessao_votacaoId_key" ON "cessao"("votacaoId");

-- CreateIndex
CREATE INDEX "obrigacao_devedorId_idx" ON "obrigacao"("devedorId");

-- CreateIndex
CREATE INDEX "obrigacao_credorId_idx" ON "obrigacao"("credorId");

-- CreateIndex
CREATE INDEX "obrigacao_rodadaId_tipo_idx" ON "obrigacao"("rodadaId", "tipo");

-- CreateIndex
CREATE INDEX "pagamento_obrigacaoId_idx" ON "pagamento"("obrigacaoId");

-- CreateIndex
CREATE INDEX "aviso_compra_rodadaId_idx" ON "aviso_compra"("rodadaId");

-- CreateIndex
CREATE INDEX "aquisicao_rodadaId_idx" ON "aquisicao"("rodadaId");

-- CreateIndex
CREATE UNIQUE INDEX "jogo_bloqueado_ataInclusaoNumero_key" ON "jogo_bloqueado"("ataInclusaoNumero");

-- CreateIndex
CREATE INDEX "votacao_status_encerraEm_idx" ON "votacao"("status", "encerraEm");

-- CreateIndex
CREATE UNIQUE INDEX "ata_votacaoId_key" ON "ata"("votacaoId");

-- CreateIndex
CREATE INDEX "anexo_sha256_idx" ON "anexo"("sha256");

-- CreateIndex
CREATE INDEX "anexo_entidade_entidadeId_idx" ON "anexo"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "evento_auditoria_entidade_entidadeId_idx" ON "evento_auditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "evento_auditoria_ocorridoEm_idx" ON "evento_auditoria"("ocorridoEm");

-- CreateIndex
CREATE UNIQUE INDEX "sessao_tokenHash_key" ON "sessao"("tokenHash");

-- CreateIndex
CREATE INDEX "sessao_pessoaId_idx" ON "sessao"("pessoaId");

-- CreateIndex
CREATE INDEX "steam_app_prioridadeSync_detalhesEm_idx" ON "steam_app"("prioridadeSync", "detalhesEm");

-- CreateIndex
CREATE INDEX "jogo_possuido_appId_idx" ON "jogo_possuido"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "item_lista_desejos_pessoaId_origem_appId_key" ON "item_lista_desejos"("pessoaId", "origem", "appId");

-- AddForeignKey
ALTER TABLE "membro" ADD CONSTRAINT "membro_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrante_familia" ADD CONSTRAINT "integrante_familia_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adesao" ADD CONSTRAINT "adesao_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adesao" ADD CONSTRAINT "adesao_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "versao_regulamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participacao_ciclo" ADD CONSTRAINT "participacao_ciclo_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "ciclo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participacao_ciclo" ADD CONSTRAINT "participacao_ciclo_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodada" ADD CONSTRAINT "rodada_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "ciclo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodada" ADD CONSTRAINT "rodada_sorteadoOriginalId_fkey" FOREIGN KEY ("sorteadoOriginalId") REFERENCES "pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodada" ADD CONSTRAINT "rodada_contempladoId_fkey" FOREIGN KEY ("contempladoId") REFERENCES "pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodada" ADD CONSTRAINT "rodada_versaoRegulamentoId_fkey" FOREIGN KEY ("versaoRegulamentoId") REFERENCES "versao_regulamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodada" ADD CONSTRAINT "rodada_rodadaAnuladaId_fkey" FOREIGN KEY ("rodadaAnuladaId") REFERENCES "rodada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sorteio" ADD CONSTRAINT "sorteio_rodadaId_fkey" FOREIGN KEY ("rodadaId") REFERENCES "rodada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaracao" ADD CONSTRAINT "declaracao_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaracao" ADD CONSTRAINT "declaracao_rodadaId_fkey" FOREIGN KEY ("rodadaId") REFERENCES "rodada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaracao" ADD CONSTRAINT "declaracao_obrigacaoId_fkey" FOREIGN KEY ("obrigacaoId") REFERENCES "obrigacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaracao" ADD CONSTRAINT "declaracao_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "ciclo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cessao" ADD CONSTRAINT "cessao_rodadaId_fkey" FOREIGN KEY ("rodadaId") REFERENCES "rodada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cessao" ADD CONSTRAINT "cessao_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cessao" ADD CONSTRAINT "cessao_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cessao" ADD CONSTRAINT "cessao_votacaoId_fkey" FOREIGN KEY ("votacaoId") REFERENCES "votacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_rodadaId_fkey" FOREIGN KEY ("rodadaId") REFERENCES "rodada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_rodadaOrigemId_fkey" FOREIGN KEY ("rodadaOrigemId") REFERENCES "rodada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_pagamentoOrigemId_fkey" FOREIGN KEY ("pagamentoOrigemId") REFERENCES "pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_aquisicaoReembolsoId_fkey" FOREIGN KEY ("aquisicaoReembolsoId") REFERENCES "aquisicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_devedorId_fkey" FOREIGN KEY ("devedorId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_credorId_fkey" FOREIGN KEY ("credorId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_obrigacaoId_fkey" FOREIGN KEY ("obrigacaoId") REFERENCES "obrigacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_recebedorId_fkey" FOREIGN KEY ("recebedorId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_comprovanteId_fkey" FOREIGN KEY ("comprovanteId") REFERENCES "anexo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_compra" ADD CONSTRAINT "aviso_compra_rodadaId_fkey" FOREIGN KEY ("rodadaId") REFERENCES "rodada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_compra" ADD CONSTRAINT "aviso_compra_contempladoId_fkey" FOREIGN KEY ("contempladoId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aquisicao" ADD CONSTRAINT "aquisicao_rodadaId_fkey" FOREIGN KEY ("rodadaId") REFERENCES "rodada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aquisicao" ADD CONSTRAINT "aquisicao_avisoId_fkey" FOREIGN KEY ("avisoId") REFERENCES "aviso_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aquisicao" ADD CONSTRAINT "aquisicao_comprovanteId_fkey" FOREIGN KEY ("comprovanteId") REFERENCES "anexo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aquisicao" ADD CONSTRAINT "aquisicao_reembolsoComprovanteId_fkey" FOREIGN KEY ("reembolsoComprovanteId") REFERENCES "anexo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votacao" ADD CONSTRAINT "votacao_versaoRegulamentoId_fkey" FOREIGN KEY ("versaoRegulamentoId") REFERENCES "versao_regulamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voto" ADD CONSTRAINT "voto_votacaoId_fkey" FOREIGN KEY ("votacaoId") REFERENCES "votacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voto" ADD CONSTRAINT "voto_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ata" ADD CONSTRAINT "ata_votacaoId_fkey" FOREIGN KEY ("votacaoId") REFERENCES "votacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jogo_possuido" ADD CONSTRAINT "jogo_possuido_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_lista_desejos" ADD CONSTRAINT "item_lista_desejos_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

