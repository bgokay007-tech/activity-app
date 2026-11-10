-- AlterTable
ALTER TABLE "TravelRoute" ADD COLUMN IF NOT EXISTS "provinces" TEXT[] DEFAULT ARRAY[]::TEXT[];
