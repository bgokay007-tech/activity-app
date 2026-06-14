-- Add cancelRequested flag to TournamentParticipant
ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "cancelRequested" BOOLEAN NOT NULL DEFAULT false;
