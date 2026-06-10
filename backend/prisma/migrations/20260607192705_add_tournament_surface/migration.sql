-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "isIndoor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "surface" TEXT;
