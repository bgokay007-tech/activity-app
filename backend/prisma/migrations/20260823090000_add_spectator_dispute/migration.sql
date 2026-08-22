-- AlterTable
ALTER TABLE "MatchSpectator" ADD COLUMN "disputeVoterIds" JSONB NOT NULL DEFAULT '[]';
