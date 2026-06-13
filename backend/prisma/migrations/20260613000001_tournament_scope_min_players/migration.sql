-- AlterTable: add scope and minPlayers to Tournament
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'YEREL';
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "minPlayers" INTEGER NOT NULL DEFAULT 2;
