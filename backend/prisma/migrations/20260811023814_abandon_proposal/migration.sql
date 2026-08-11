-- Voleybolde "Skor Girilemiyor" akışında (berabere/arşiv ya da yeniden planlama)
-- çoğunluk onayı bekleyen teklifi tutar.
ALTER TABLE "ActivityRequest" ADD COLUMN "abandonProposal" JSONB;
