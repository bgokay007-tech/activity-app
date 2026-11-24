-- Turnuva maçından verilen tesis siparişi — işletme "hangi maç" görsün diye
ALTER TABLE "VenueOrder" ADD COLUMN IF NOT EXISTS "tournamentMatchId" TEXT;
CREATE INDEX IF NOT EXISTS "VenueOrder_tournamentMatchId_idx" ON "VenueOrder"("tournamentMatchId");
