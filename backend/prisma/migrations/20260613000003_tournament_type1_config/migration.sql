-- AlterTable: add type-1 config fields to Tournament
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "setsPerMatch"         INTEGER;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "advantageScoring"     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "matchesBeforePlayoff" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "playoffQualifiers"    INTEGER;
