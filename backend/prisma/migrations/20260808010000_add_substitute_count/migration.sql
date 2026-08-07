-- Voleybol: ilan sahibinin istediği yedek oyuncu kontenjanı (create formundaki
-- subCount ile aynı kavram) — substitutePlayers'ın kaç kişiyle dolu olduğundan
-- bağımsız, açık ilanda da (kurucu) değiştirilebilir.
ALTER TABLE "ActivityRequest" ADD COLUMN "substituteCount" INTEGER NOT NULL DEFAULT 0;
