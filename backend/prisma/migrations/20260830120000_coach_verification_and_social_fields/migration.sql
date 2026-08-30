-- Antrenörlük CV'sine resmi doğrulama (TTF/GSB, kademe, T.C. kimlik, adli sicil, eğitim),
-- uzmanlık alanları, kort ücreti politikası ve sosyal kanıt (profil fotoğrafı, tanıtım
-- videosu, sosyal medya) alanları eklendi.
ALTER TABLE "CoachListing" ADD COLUMN "certIssuer" TEXT;
ALTER TABLE "CoachListing" ADD COLUMN "kademe" TEXT;
ALTER TABLE "CoachListing" ADD COLUMN "tcKimlikNo" TEXT;
ALTER TABLE "CoachListing" ADD COLUMN "tcKimlikVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CoachListing" ADD COLUMN "adliSicilUrl" TEXT;
ALTER TABLE "CoachListing" ADD COLUMN "adliSicilVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CoachListing" ADD COLUMN "education" TEXT;
ALTER TABLE "CoachListing" ADD COLUMN "specializations" JSONB;
ALTER TABLE "CoachListing" ADD COLUMN "profilePhotoUrl" TEXT;
ALTER TABLE "CoachListing" ADD COLUMN "introVideoUrl" TEXT;
ALTER TABLE "CoachListing" ADD COLUMN "socialInstagram" TEXT;
ALTER TABLE "CoachListing" ADD COLUMN "socialLinkedin" TEXT;
ALTER TABLE "CoachListing" ADD COLUMN "courtFeeIncluded" BOOLEAN;
