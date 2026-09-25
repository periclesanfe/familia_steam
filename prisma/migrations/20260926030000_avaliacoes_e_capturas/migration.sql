-- 15 §5 (M10b): avaliações da loja e capturas em tamanho cheio para a página do jogo.
-- AlterTable
ALTER TABLE "steam_app" ADD COLUMN     "avaliacaoNota" INTEGER,
ADD COLUMN     "avaliacoesPositivas" INTEGER,
ADD COLUMN     "avaliacoesTotal" INTEGER,
ADD COLUMN     "capturasGrandes" TEXT[] DEFAULT ARRAY[]::TEXT[];
