-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifyFriendListings" BOOLEAN NOT NULL DEFAULT true;
