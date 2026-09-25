-- 15 §6 (M10c): calendário de promoções da Steam, global (sem RLS).
-- CreateTable
CREATE TABLE "evento_promocao" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "fonteUrl" TEXT NOT NULL,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "evento_promocao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_promocao_fim_idx" ON "evento_promocao"("fim");

