-- 15 §5 (M10b): detalhes ricos dos apps e histórico de preço observado pelo sistema (globais).
-- AlterTable
ALTER TABLE "steam_app" ADD COLUMN     "capturas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "descontoPct" INTEGER,
ADD COLUMN     "descricaoCurta" TEXT,
ADD COLUMN     "desenvolvedoras" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "generos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lancamento" TEXT,
ADD COLUMN     "metacritic" INTEGER,
ADD COLUMN     "precoInicialCentavos" INTEGER,
ADD COLUMN     "publicadoras" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "preco_app" (
    "appId" INTEGER NOT NULL,
    "em" TIMESTAMPTZ(3) NOT NULL,
    "precoCentavos" INTEGER NOT NULL,
    "descontoPct" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "preco_app_pkey" PRIMARY KEY ("appId","em")
);

