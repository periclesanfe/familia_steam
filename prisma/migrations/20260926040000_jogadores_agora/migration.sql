-- 15 §5 (M10b): jogadores agora (GetNumberOfCurrentPlayers), lido junto com os detalhes.
-- AlterTable
ALTER TABLE "steam_app" ADD COLUMN     "jogadoresAgora" INTEGER,
ADD COLUMN     "jogadoresEm" TIMESTAMPTZ(3);
