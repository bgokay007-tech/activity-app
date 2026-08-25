-- AlterTable
ALTER TABLE "CoachListing" ADD COLUMN "cities" JSONB;
ALTER TABLE "CoachListing" ALTER COLUMN "location" DROP NOT NULL;
