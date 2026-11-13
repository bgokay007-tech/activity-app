-- Müsaitlik eşleştirmede "belirli kort yok" için oyuncu kort tercihleri
ALTER TABLE "TournamentRoundAvailability"
  ADD COLUMN IF NOT EXISTS "preferredCourts" JSONB;
