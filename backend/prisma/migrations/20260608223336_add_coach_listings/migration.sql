-- CreateTable
CREATE TABLE "CoachListing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT NOT NULL,
    "credentialLevel" TEXT NOT NULL,
    "certName" TEXT,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "individual" BOOLEAN NOT NULL DEFAULT true,
    "group" BOOLEAN NOT NULL DEFAULT false,
    "priceIndividual" INTEGER NOT NULL DEFAULT 0,
    "priceGroup" INTEGER NOT NULL DEFAULT 0,
    "maxGroupSize" INTEGER NOT NULL DEFAULT 4,
    "location" TEXT NOT NULL,
    "city" TEXT,
    "days" JSONB NOT NULL DEFAULT '[]',
    "timeFrom" TEXT NOT NULL DEFAULT '09:00',
    "timeTo" TEXT NOT NULL DEFAULT '21:00',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachListing_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CoachListing" ADD CONSTRAINT "CoachListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
