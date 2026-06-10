-- AlterTable
ALTER TABLE "ActivityRequest" ADD COLUMN     "scoreEnteredBy" TEXT,
ADD COLUMN     "scoreStatus" TEXT NOT NULL DEFAULT 'NONE';
