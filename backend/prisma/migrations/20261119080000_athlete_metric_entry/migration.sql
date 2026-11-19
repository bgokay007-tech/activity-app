-- Sporcu Kartı metrik geçmişi (boy/kilo, kompozisyon, antropometri, test, günlük sağlık)
CREATE TABLE "AthleteMetricEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteMetricEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AthleteMetricEntry_userId_key_measuredAt_idx" ON "AthleteMetricEntry"("userId", "key", "measuredAt");
CREATE INDEX "AthleteMetricEntry_userId_category_measuredAt_idx" ON "AthleteMetricEntry"("userId", "category", "measuredAt");
CREATE INDEX "AthleteMetricEntry_userId_measuredAt_idx" ON "AthleteMetricEntry"("userId", "measuredAt");

ALTER TABLE "AthleteMetricEntry" ADD CONSTRAINT "AthleteMetricEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
