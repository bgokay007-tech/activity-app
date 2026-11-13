-- Müsaitliğe göre eşleştirme: turnuva bayrağı + haftalık tur + müsaitlik + maç sohbeti
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "availabilityMatchEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "TournamentRound" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "availabilityOpenAt" TIMESTAMP(3) NOT NULL,
    "availabilityCloseAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "proposedMatches" JSONB,
    "lastFingerprint" TEXT,
    "matchingApprovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentRound_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TournamentRound_tournamentId_roundIndex_key"
    ON "TournamentRound"("tournamentId", "roundIndex");

CREATE TABLE IF NOT EXISTS "TournamentRoundAvailability" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maxMatches" INTEGER NOT NULL DEFAULT 1,
    "slots" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentRoundAvailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TournamentRoundAvailability_roundId_userId_key"
    ON "TournamentRoundAvailability"("roundId", "userId");

CREATE TABLE IF NOT EXISTS "TournamentMatchMessage" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CHAT',
    "requestType" TEXT,
    "requestData" JSONB,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentMatchMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TournamentMatch" ADD COLUMN IF NOT EXISTS "roundId" TEXT;

DO $$ BEGIN
    ALTER TABLE "TournamentRound" ADD CONSTRAINT "TournamentRound_tournamentId_fkey"
        FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "TournamentRoundAvailability" ADD CONSTRAINT "TournamentRoundAvailability_roundId_fkey"
        FOREIGN KEY ("roundId") REFERENCES "TournamentRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "TournamentRoundAvailability" ADD CONSTRAINT "TournamentRoundAvailability_tournamentId_fkey"
        FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "TournamentRoundAvailability" ADD CONSTRAINT "TournamentRoundAvailability_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_roundId_fkey"
        FOREIGN KEY ("roundId") REFERENCES "TournamentRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "TournamentMatchMessage" ADD CONSTRAINT "TournamentMatchMessage_matchId_fkey"
        FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "TournamentMatchMessage" ADD CONSTRAINT "TournamentMatchMessage_senderId_fkey"
        FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
