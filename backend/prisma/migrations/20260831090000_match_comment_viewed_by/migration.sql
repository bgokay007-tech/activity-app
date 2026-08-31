-- MatchComment: yorumu silmeden once "gorenler var mi" uyarisi icin viewedBy alani.
ALTER TABLE "MatchComment" ADD COLUMN "viewedBy" JSONB NOT NULL DEFAULT '[]';
