-- AlterTable
ALTER TABLE "TravelRoute" ADD COLUMN "path" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "TravelRoute" ADD COLUMN "startLat" DOUBLE PRECISION;
ALTER TABLE "TravelRoute" ADD COLUMN "startLng" DOUBLE PRECISION;
ALTER TABLE "TravelRoute" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "TravelRoute" ADD COLUMN "externalId" TEXT;
ALTER TABLE "TravelRoute" ADD COLUMN "sourceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TravelRoute_externalId_key" ON "TravelRoute"("externalId");
