-- RefereeListing: kişisel bilgiler (ad soyad, cinsiyet, doğum tarihi) — CoachListing ile aynı
-- desen. Hepsi nullable ekleniyor, veri kaybı riski yok.
ALTER TABLE "RefereeListing" ADD COLUMN "personalFullName" TEXT;
ALTER TABLE "RefereeListing" ADD COLUMN "personalGender" TEXT;
ALTER TABLE "RefereeListing" ADD COLUMN "personalBirthDate" TIMESTAMP(3);
