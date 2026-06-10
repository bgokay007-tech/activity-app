-- AlterTable
ALTER TABLE "ActivityRequest" ADD COLUMN     "matchType" TEXT NOT NULL DEFAULT 'SINGLE',
ADD COLUMN     "participants" JSONB NOT NULL DEFAULT '[]';
