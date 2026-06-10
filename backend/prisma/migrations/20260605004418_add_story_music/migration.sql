-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "musicName" TEXT,
ADD COLUMN     "musicUrl" TEXT,
ADD COLUMN     "muteVideo" BOOLEAN NOT NULL DEFAULT false;
