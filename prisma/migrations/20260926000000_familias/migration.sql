-- M10 (docs/spec/15): várias famílias isoladas por Row-Level Security (SEG-13).
-- Os dados já existentes vão para a família padrão: o default de "familiaId" lê app.familia_id,
-- que fica apontando para ela durante o preenchimento das colunas novas.
SELECT set_config('app.familia_id', '00000000-0000-4000-8000-000000000001', false);


-- CreateEnum
CREATE TYPE "StatusIndicacao" AS ENUM ('ABERTA', 'APROVADA', 'RECUSADA', 'CADUCOU', 'CANCELADA');

-- DropIndex
DROP INDEX "ciclo_numero_key";

-- DropIndex
DROP INDEX "jogo_bloqueado_ataInclusaoNumero_key";

-- DropIndex
DROP INDEX "versao_regulamento_ataNumero_key";

-- DropIndex
DROP INDEX "versao_regulamento_numero_key";

-- DropIndex
DROP INDEX "versao_regulamento_ordem_key";

-- AlterTable
ALTER TABLE "adesao" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "anexo" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "aquisicao" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "ata" DROP CONSTRAINT "ata_pkey",
ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid,
ADD CONSTRAINT "ata_pkey" PRIMARY KEY ("familiaId", "numero");

-- AlterTable
ALTER TABLE "aviso_compra" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "cessao" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "ciclo" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "declaracao" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "evento_auditoria" ADD COLUMN     "familiaId" UUID DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "integrante_familia" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "jogo_bloqueado" DROP CONSTRAINT "jogo_bloqueado_pkey",
ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid,
ADD CONSTRAINT "jogo_bloqueado_pkey" PRIMARY KEY ("familiaId", "numero");

-- AlterTable
ALTER TABLE "membro" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "obrigacao" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "pagamento" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "participacao_ciclo" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "pessoa" ADD COLUMN     "familiaId" UUID;

-- AlterTable
ALTER TABLE "rodada" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "sorteio" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "versao_regulamento" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "votacao" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "voto" ADD COLUMN     "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid;

-- CreateTable
CREATE TABLE "familia" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "criadaPorId" UUID NOT NULL,
    "criadaEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "familia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicacao" (
    "id" UUID NOT NULL,
    "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid,
    "candidatoSteamId64" VARCHAR(17) NOT NULL,
    "candidatoId" UUID NOT NULL,
    "indicadaPorId" UUID NOT NULL,
    "email" TEXT,
    "status" "StatusIndicacao" NOT NULL DEFAULT 'ABERTA',
    "criadaEm" TIMESTAMPTZ(3) NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "encerradaEm" TIMESTAMPTZ(3),
    "votacaoId" UUID,

    CONSTRAINT "indicacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aprovacao_indicacao" (
    "indicacaoId" UUID NOT NULL,
    "familiaId" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.familia_id'::text, true), ''::text))::uuid,
    "pessoaId" UUID NOT NULL,
    "aprova" BOOLEAN NOT NULL,
    "em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "aprovacao_indicacao_pkey" PRIMARY KEY ("indicacaoId","pessoaId")
);

-- CreateTable
CREATE TABLE "convite" (
    "id" UUID NOT NULL,
    "familiaId" UUID NOT NULL,
    "indicacaoId" UUID NOT NULL,
    "steamId64" VARCHAR(17) NOT NULL,
    "token" TEXT NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "usadoEm" TIMESTAMPTZ(3),
    "usadoPorId" UUID,

    CONSTRAINT "convite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amizade_steam" (
    "pessoaId" UUID NOT NULL,
    "amigoSteamId64" VARCHAR(17) NOT NULL,
    "desde" TIMESTAMPTZ(3),
    "nick" TEXT,
    "avatarUrl" TEXT,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "amizade_steam_pkey" PRIMARY KEY ("pessoaId","amigoSteamId64")
);

-- CreateIndex
CREATE UNIQUE INDEX "indicacao_votacaoId_key" ON "indicacao"("votacaoId");

-- CreateIndex
CREATE INDEX "indicacao_familiaId_status_idx" ON "indicacao"("familiaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "convite_indicacaoId_key" ON "convite"("indicacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "convite_token_key" ON "convite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ciclo_familiaId_numero_key" ON "ciclo"("familiaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "jogo_bloqueado_familiaId_ataInclusaoNumero_key" ON "jogo_bloqueado"("familiaId", "ataInclusaoNumero");

-- CreateIndex
CREATE UNIQUE INDEX "versao_regulamento_familiaId_ordem_key" ON "versao_regulamento"("familiaId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "versao_regulamento_familiaId_numero_key" ON "versao_regulamento"("familiaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "versao_regulamento_familiaId_ataNumero_key" ON "versao_regulamento"("familiaId", "ataNumero");

-- AddForeignKey
ALTER TABLE "aprovacao_indicacao" ADD CONSTRAINT "aprovacao_indicacao_indicacaoId_fkey" FOREIGN KEY ("indicacaoId") REFERENCES "indicacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convite" ADD CONSTRAINT "convite_indicacaoId_fkey" FOREIGN KEY ("indicacaoId") REFERENCES "indicacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO "familia" (id, nome, "criadaPorId", "criadaEm")
SELECT '00000000-0000-4000-8000-000000000001', 'Família Steam',
       COALESCE((SELECT id FROM pessoa ORDER BY "criadoEm" LIMIT 1), '00000000-0000-0000-0000-000000000000'),
       now()
WHERE EXISTS (SELECT 1 FROM membro);
UPDATE "pessoa" SET "familiaId" = '00000000-0000-4000-8000-000000000001'
WHERE id IN (SELECT "pessoaId" FROM membro UNION SELECT "pessoaId" FROM integrante_familia);

-- votação aberta única por objeto passa a ser por família
DROP INDEX votacao_aberta_por_objeto;
CREATE UNIQUE INDEX votacao_aberta_por_objeto ON votacao ("familiaId", assunto, "chaveObjeto") WHERE status = 'ABERTA';
CREATE UNIQUE INDEX indicacao_aberta_por_candidato ON indicacao ("familiaId", "candidatoSteamId64") WHERE status = 'ABERTA';

-- RLS: o app (app_rw, sem BYPASSRLS) só enxerga a família da transação; o dono (migrações) não é afetado
ALTER TABLE "membro" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "membro" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "integrante_familia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "integrante_familia" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "versao_regulamento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "versao_regulamento" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "adesao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "adesao" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "ciclo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "ciclo" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "participacao_ciclo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "participacao_ciclo" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "rodada" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "rodada" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "sorteio" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "sorteio" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "declaracao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "declaracao" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "cessao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "cessao" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "obrigacao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "obrigacao" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "pagamento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "pagamento" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "aviso_compra" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "aviso_compra" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "aquisicao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "aquisicao" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "jogo_bloqueado" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "jogo_bloqueado" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "votacao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "votacao" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "voto" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "voto" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "ata" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "ata" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "anexo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "anexo" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "indicacao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "indicacao" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "aprovacao_indicacao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY familia ON "aprovacao_indicacao" USING ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid) WITH CHECK ("familiaId" = NULLIF(current_setting('app.familia_id', true), '')::uuid);
ALTER TABLE "evento_auditoria" ENABLE ROW LEVEL SECURITY;
-- eventos pessoais (login, sessão) têm família nula e só aparecem fora de uma família
CREATE POLICY familia ON "evento_auditoria"
  USING ("familiaId" IS NOT DISTINCT FROM NULLIF(current_setting('app.familia_id', true), '')::uuid)
  WITH CHECK ("familiaId" IS NOT DISTINCT FROM NULLIF(current_setting('app.familia_id', true), '')::uuid);

SELECT set_config('app.familia_id', '', false);
