-- AlterTable: add isPaid and contactPhone to Tournament
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
