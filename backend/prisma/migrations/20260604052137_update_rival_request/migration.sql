-- AlterTable
ALTER TABLE "ActivityRequest" ADD COLUMN     "courtAddress" TEXT,
ADD COLUMN     "courtLat" DOUBLE PRECISION,
ADD COLUMN     "courtLng" DOUBLE PRECISION,
ADD COLUMN     "courtName" TEXT,
ADD COLUMN     "isCourtReserved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "levelDetail" TEXT,
ADD COLUMN     "matchDate" TIMESTAMP(3),
ADD COLUMN     "matchTime" TEXT;
