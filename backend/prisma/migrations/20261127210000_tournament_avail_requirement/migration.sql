-- Lig Rekabetçi / Lig Antreman: tur başına min. müsait gün + zorunlu saat aralığı şartı
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "availRequirementEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "availReqMinDays" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "availReqHourStart" TEXT;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "availReqHourEnd" TEXT;
