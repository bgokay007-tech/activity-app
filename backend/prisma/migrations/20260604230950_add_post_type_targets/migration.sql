-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "targets" JSONB,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'POST';
