-- 3.set: set mi süper TB mi — oyuncular maç öncesi ortak karar
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "thirdSetPlayersDecide" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TournamentMatch" ADD COLUMN IF NOT EXISTS "thirdSetFormat" TEXT;
ALTER TABLE "TournamentMatch" ADD COLUMN IF NOT EXISTS "thirdSetVotes" JSONB;
