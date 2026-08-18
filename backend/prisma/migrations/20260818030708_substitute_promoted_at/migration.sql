-- Yedekten asıl kadroya terfi anını ({userId: ISO tarih}) tutar — terfi eden kişi
-- iptal politikası uymasa bile terfiden sonraki 1 saat içinde şartsız çıkabilir.
ALTER TABLE "ActivityRequest" ADD COLUMN "substitutePromotedAt" JSONB NOT NULL DEFAULT '{}';
