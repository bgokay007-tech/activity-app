CREATE TABLE IF NOT EXISTS "TournamentMessage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TournamentMessage_tournamentId_idx" ON "TournamentMessage"("tournamentId");
CREATE INDEX IF NOT EXISTS "TournamentMessage_senderId_idx" ON "TournamentMessage"("senderId");

DO $$ BEGIN
    ALTER TABLE "TournamentMessage"
        ADD CONSTRAINT "TournamentMessage_tournamentId_fkey"
        FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "TournamentMessage"
        ADD CONSTRAINT "TournamentMessage_senderId_fkey"
        FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

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
