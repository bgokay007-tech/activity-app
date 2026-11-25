-- Ekipman ilanı: isteğe bağlı reklam (dış site linki + dönen görseller)
ALTER TABLE "EquipmentListing" ADD COLUMN IF NOT EXISTS "isAd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EquipmentListing" ADD COLUMN IF NOT EXISTS "adUrl" TEXT;
ALTER TABLE "EquipmentListing" ADD COLUMN IF NOT EXISTS "adImages" JSONB NOT NULL DEFAULT '[]';
