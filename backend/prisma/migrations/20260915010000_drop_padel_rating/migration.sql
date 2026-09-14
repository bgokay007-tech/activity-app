-- Padel harman değerlendirme sistemi (kendi %85 / antrenör %10 / takım arkadaşı %5)
-- tamamen kaldırıldı — padel artık tenisle aynı saf anket-seed + ELO yolunu kullanıyor
-- (bkz. interest.controller.js saveAssessment). Tablo ve ham puan kolonları artık
-- hiçbir kod tarafından okunmuyor.
DROP TABLE "PadelRating";

ALTER TABLE "UserInterest" DROP COLUMN "selfAssessmentRating",
DROP COLUMN "doublesSelfAssessmentRating";
