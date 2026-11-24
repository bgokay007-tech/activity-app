-- Geçmiş salon üyelikleri (Arşiv > Salonlar) için ayrılma/iptal zamanı.
ALTER TABLE "GymMember" ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMP(3);
