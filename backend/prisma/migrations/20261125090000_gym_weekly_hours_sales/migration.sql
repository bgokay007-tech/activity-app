-- Gün bazlı çalışma saatleri + yapılandırılmış salon içi satış ürünleri
ALTER TABLE "GymListing" ADD COLUMN IF NOT EXISTS "weeklyHours" JSONB;
ALTER TABLE "GymListing" ADD COLUMN IF NOT EXISTS "salesProducts" JSONB NOT NULL DEFAULT '[]';
