-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "duration" TEXT,
ADD COLUMN     "eventDate" TIMESTAMP(3),
ADD COLUMN     "location" TEXT,
ADD COLUMN     "startTime" TEXT;
