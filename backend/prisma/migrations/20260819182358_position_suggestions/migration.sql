-- Voleybolde ilan sahibi olmayan katılımcının kendisi için önerdiği, ilan sahibinin
-- onayını bekleyen pozisyon önerileri.
ALTER TABLE "ActivityRequest" ADD COLUMN "positionSuggestions" JSONB NOT NULL DEFAULT '[]';
