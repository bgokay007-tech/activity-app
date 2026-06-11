-- Add musicArtist and musicCoverUrl to Post (added via db push, never migrated)
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "musicArtist"   TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "musicCoverUrl" TEXT;
