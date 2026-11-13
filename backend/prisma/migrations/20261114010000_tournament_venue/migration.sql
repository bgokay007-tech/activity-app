-- Turnuva sabit Pro+ tesis baglantisi (eslesme kartindan rezervasyon)
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "venueId" TEXT;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "venueCourtId" TEXT;
