CREATE TABLE IF NOT EXISTS "GymReview" (
    "id" TEXT NOT NULL,
    "gymListingId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GymReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymReview_gymListingId_reviewerId_key" ON "GymReview"("gymListingId", "reviewerId");

DO $$ BEGIN
    ALTER TABLE "GymReview" ADD CONSTRAINT "GymReview_gymListingId_fkey"
        FOREIGN KEY ("gymListingId") REFERENCES "GymListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GymReview" ADD CONSTRAINT "GymReview_reviewerId_fkey"
        FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
