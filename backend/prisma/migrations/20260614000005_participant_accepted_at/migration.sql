-- Add acceptedAt to track acceptance order for main list / waitlist
ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
