-- Ücretli ekipman/mağaza reklamı (günlük 5 TL, EFT)
ALTER TABLE "EquipmentListing" ADD COLUMN IF NOT EXISTS "adDays" INTEGER;
ALTER TABLE "EquipmentListing" ADD COLUMN IF NOT EXISTS "adStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "EquipmentListing" ADD COLUMN IF NOT EXISTS "adPaidUntil" TIMESTAMP(3);
ALTER TABLE "EquipmentListing" ADD COLUMN IF NOT EXISTS "adAmount" INTEGER;

ALTER TABLE "EquipmentStore" ADD COLUMN IF NOT EXISTS "isAd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EquipmentStore" ADD COLUMN IF NOT EXISTS "adUrl" TEXT;
ALTER TABLE "EquipmentStore" ADD COLUMN IF NOT EXISTS "adImages" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "EquipmentStore" ADD COLUMN IF NOT EXISTS "adDays" INTEGER;
ALTER TABLE "EquipmentStore" ADD COLUMN IF NOT EXISTS "adStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "EquipmentStore" ADD COLUMN IF NOT EXISTS "adPaidUntil" TIMESTAMP(3);
ALTER TABLE "EquipmentStore" ADD COLUMN IF NOT EXISTS "adAmount" INTEGER;

CREATE INDEX IF NOT EXISTS "EquipmentListing_adActive_idx"
  ON "EquipmentListing" ("subCategory", "adStatus", "adPaidUntil");

CREATE INDEX IF NOT EXISTS "EquipmentStore_adActive_idx"
  ON "EquipmentStore" ("subCategory", "adStatus", "adPaidUntil");
