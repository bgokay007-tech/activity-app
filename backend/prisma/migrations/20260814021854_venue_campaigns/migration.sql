-- Kampanyalar: saat aralığı indirimi (discountCampaigns) ve sadakat kampanyası (loyaltyCampaign) ayarları.
ALTER TABLE "BusinessVenue" ADD COLUMN "discountCampaigns" JSONB;
ALTER TABLE "BusinessVenue" ADD COLUMN "loyaltyCampaign" JSONB;

-- Bir kullanıcının bir tesiste biriktirdiği/kazandığı bedava rezervasyon dakikası.
CREATE TABLE "VenueLoyaltyCredit" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "freeMinutes" INTEGER NOT NULL DEFAULT 0,
    "lastGrantedPeriod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueLoyaltyCredit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VenueLoyaltyCredit_venueId_userId_key" ON "VenueLoyaltyCredit"("venueId", "userId");

ALTER TABLE "VenueLoyaltyCredit" ADD CONSTRAINT "VenueLoyaltyCredit_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "BusinessVenue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VenueLoyaltyCredit" ADD CONSTRAINT "VenueLoyaltyCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
