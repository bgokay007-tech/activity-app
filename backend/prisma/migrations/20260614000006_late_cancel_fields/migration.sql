-- Add late cancel tracking and tournament ban to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lateCancelCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tournamentBanRemaining" INTEGER NOT NULL DEFAULT 0;

-- Add cancel reason to TournamentParticipant
ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
