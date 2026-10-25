-- Profildeki Kaydedilenler: gönderi, reels ve müzik.
CREATE TABLE IF NOT EXISTS "SavedItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "postId" TEXT,
    "saveKey" TEXT NOT NULL,
    "musicUrl" TEXT,
    "musicName" TEXT,
    "musicArtist" TEXT,
    "musicCoverUrl" TEXT,
    "musicStartTime" DOUBLE PRECISION,
    "musicEndTime" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SavedItem_userId_saveKey_key" ON "SavedItem"("userId", "saveKey");
CREATE INDEX IF NOT EXISTS "SavedItem_userId_kind_idx" ON "SavedItem"("userId", "kind");

DO $$ BEGIN
    ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
