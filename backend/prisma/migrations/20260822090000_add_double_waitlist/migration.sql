-- AlterTable
ALTER TABLE "ActivityRequest" ADD COLUMN "waitlistPlayers" JSONB NOT NULL DEFAULT '[]';
