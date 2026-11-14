-- Son başvuru + yetersiz oyuncu: yaratıcıya 24 saat uyarı penceresi
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "underfillWarnedAt" TIMESTAMP(3);
