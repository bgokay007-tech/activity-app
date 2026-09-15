-- AlterTable
ALTER TABLE "ClubListing" ADD COLUMN "venueId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "clubListingId" TEXT;

-- CreateTable
CREATE TABLE "ClubMembershipApplication" (
    "id" TEXT NOT NULL,
    "clubListingId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubMembershipApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubMembershipApplication_clubListingId_applicantId_key" ON "ClubMembershipApplication"("clubListingId", "applicantId");

-- AddForeignKey
ALTER TABLE "ClubListing" ADD CONSTRAINT "ClubListing_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "BusinessVenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_clubListingId_fkey" FOREIGN KEY ("clubListingId") REFERENCES "ClubListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembershipApplication" ADD CONSTRAINT "ClubMembershipApplication_clubListingId_fkey" FOREIGN KEY ("clubListingId") REFERENCES "ClubListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembershipApplication" ADD CONSTRAINT "ClubMembershipApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
