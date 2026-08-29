-- CoachListing.achievements: String? -> JSONB (string[]) — mevcut metin (varsa) tek elemanli
-- bir diziye tasinir, veri kaybi olmaz.
ALTER TABLE "CoachListing" ALTER COLUMN "achievements" TYPE JSONB USING (
    CASE WHEN "achievements" IS NULL THEN NULL ELSE jsonb_build_array("achievements") END
);

-- CoachListing.personalBirthYear (Int?) -> personalBirthDate (DateTime?) — mevcut yil, o
-- yilin 1 Ocak'i olarak tasinir (eski kayitlarda gun/ay bilgisi hic yoktu).
ALTER TABLE "CoachListing" ADD COLUMN "personalBirthDate" TIMESTAMP(3);
UPDATE "CoachListing" SET "personalBirthDate" = make_date("personalBirthYear", 1, 1) WHERE "personalBirthYear" IS NOT NULL;
ALTER TABLE "CoachListing" DROP COLUMN "personalBirthYear";

-- CoachListing.priorExperience: String? -> JSONB ([{workplace,position,period}]) — mevcut
-- serbest metin (varsa) workplace alanina tek elemanli bir kayit olarak tasinir.
ALTER TABLE "CoachListing" ALTER COLUMN "priorExperience" TYPE JSONB USING (
    CASE WHEN "priorExperience" IS NULL THEN NULL ELSE jsonb_build_array(jsonb_build_object('workplace', "priorExperience", 'position', '', 'period', '')) END
);

-- RefereeListing.achievements: String? -> JSONB (string[]) — CoachListing ile ayni desen.
ALTER TABLE "RefereeListing" ALTER COLUMN "achievements" TYPE JSONB USING (
    CASE WHEN "achievements" IS NULL THEN NULL ELSE jsonb_build_array("achievements") END
);
