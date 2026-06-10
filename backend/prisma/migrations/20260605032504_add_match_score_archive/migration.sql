-- AlterTable
ALTER TABLE "ActivityRequest" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "score" JSONB;
