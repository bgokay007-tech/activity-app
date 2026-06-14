-- Add tournament match table and startedAt to Tournament
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "TournamentMatch" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'GROUP',
    "matchIndex" INTEGER NOT NULL DEFAULT 0,
    "p1Id" TEXT,
    "p1Name" TEXT,
    "p2Id" TEXT,
    "p2Name" TEXT,
    "score" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
