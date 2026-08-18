-- Skor bekleyen (henüz karşı taraf onaylamamış) maçlarda, skorla birlikte paylaşılan medya
-- da karşı tarafın onayını bekler — onaylanana kadar Medya sekmesinde herkese görünmez.
ALTER TABLE "Post" ADD COLUMN "mediaApprovalStatus" TEXT;
