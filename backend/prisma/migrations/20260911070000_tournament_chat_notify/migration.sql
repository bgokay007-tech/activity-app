CREATE TABLE IF NOT EXISTS "TournamentChatNotify" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TournamentChatNotify_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TournamentChatNotify_tournamentId_userId_key"
    ON "TournamentChatNotify"("tournamentId", "userId");

DO $$ BEGIN
    ALTER TABLE "TournamentChatNotify"
        ADD CONSTRAINT "TournamentChatNotify_tournamentId_fkey"
        FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "TournamentChatNotify"
        ADD CONSTRAINT "TournamentChatNotify_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
