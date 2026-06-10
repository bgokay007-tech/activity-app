-- AlterTable
ALTER TABLE "ActivityRequest" ADD COLUMN     "surface" TEXT,
ADD COLUMN     "teamSize" INTEGER NOT NULL DEFAULT 1;
