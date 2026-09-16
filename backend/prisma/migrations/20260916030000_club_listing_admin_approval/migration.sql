-- Kulüp ilanları admin onayı bekler; amblem + isteğe bağlı court bağlantısı
ALTER TABLE "ClubListing" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "ClubListing" ADD COLUMN IF NOT EXISTS "courtId" TEXT;
ALTER TABLE "ClubListing" ADD COLUMN IF NOT EXISTS "adminNote" TEXT;
