CREATE TABLE IF NOT EXISTS "City" (
    "id"       TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT,
    "status"   TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "City_province_district_key" ON "City"("province", "district");
