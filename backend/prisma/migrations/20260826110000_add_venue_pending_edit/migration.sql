-- Eksik/hatalı tesis bilgisini (adres/telefon/kort sayısı/çalışma saatleri) herhangi bir
-- kullanıcının doldurup admin onayına gönderebilmesi için, onay bekleyen taslak değişikliği
-- tutan alan.
ALTER TABLE "BusinessVenue" ADD COLUMN "pendingEdit" JSONB;
