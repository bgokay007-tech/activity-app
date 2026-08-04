-- AlterTable
ALTER TABLE "ActivityRequest" ADD COLUMN "unassignedPlayers" JSONB NOT NULL DEFAULT '[]';
