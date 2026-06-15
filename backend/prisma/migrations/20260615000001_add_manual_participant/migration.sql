-- AlterTable: make userId nullable and add manualName
ALTER TABLE "TournamentParticipant" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "TournamentParticipant" ADD COLUMN "manualName" TEXT;
