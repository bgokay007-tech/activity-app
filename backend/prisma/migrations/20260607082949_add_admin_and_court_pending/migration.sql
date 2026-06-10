-- AlterTable
ALTER TABLE "Court" ADD COLUMN     "pending" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rejectedReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;
