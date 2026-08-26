-- Topluluk Court kayıtlarının eksik bilgisini (telefon, kort sayısı, çalışma günü/saati)
-- herhangi bir kullanıcının doldurup admin onayına gönderebilmesi için gereken alanlar.
ALTER TABLE "Court" ADD COLUMN "phone" TEXT;
ALTER TABLE "Court" ADD COLUMN "courtCount" INTEGER;
ALTER TABLE "Court" ADD COLUMN "openDays" JSONB;
ALTER TABLE "Court" ADD COLUMN "openTime" TEXT;
ALTER TABLE "Court" ADD COLUMN "closeTime" TEXT;
ALTER TABLE "Court" ADD COLUMN "pendingEdit" JSONB;
