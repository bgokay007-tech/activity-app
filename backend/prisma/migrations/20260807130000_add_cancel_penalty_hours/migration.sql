-- Voleybol: kurucunun ilanda belirlediği "maça X saat kala iptal cezalı" eşiği.
-- Doluysa cancelMatch, genel 5 saat / -0.20 puan kuralı yerine bu ilana özel
-- X saat / -0.10 puan kuralını uygular.
ALTER TABLE "ActivityRequest" ADD COLUMN "cancelPenaltyHours" INTEGER;
