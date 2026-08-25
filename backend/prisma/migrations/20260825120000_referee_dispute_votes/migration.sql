-- Maçtaki mevcut hakeme itiraz eden kadro üyelerinin userId listesi. Çoğunluğa ulaşınca
-- hakem otomatik çıkarılır (bkz. disputeReferee, rival.controller.js).
ALTER TABLE "ActivityRequest" ADD COLUMN "refereeDisputeVoterIds" JSONB NOT NULL DEFAULT '[]';
