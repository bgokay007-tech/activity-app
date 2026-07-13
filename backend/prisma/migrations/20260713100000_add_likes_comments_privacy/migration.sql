-- AlterTable
ALTER TABLE "User" ADD COLUMN "likesCommentsPrivacy" TEXT NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "User" ADD COLUMN "likesCommentsExclude" JSONB NOT NULL DEFAULT '[]';
