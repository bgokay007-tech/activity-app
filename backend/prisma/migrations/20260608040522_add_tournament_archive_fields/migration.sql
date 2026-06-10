-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "bracketData" JSONB,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "ratingSnapshot" JSONB;
