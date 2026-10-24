-- 3 setlik tenis/padel turnuvasında 1-1 olunca 3. set yerine 10 sayı tiebreak.
-- false: normal 3. set (mevcut kural).
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "decidingTiebreak" BOOLEAN NOT NULL DEFAULT false;
