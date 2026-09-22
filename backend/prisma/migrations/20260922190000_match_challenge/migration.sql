-- AlterTable
ALTER TABLE "Message" ADD COLUMN "meta" JSONB;

-- CreateTable
CREATE TABLE "MatchChallenge" (
    "id" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "challengedId" TEXT NOT NULL,
    "category" "CategoryType" NOT NULL,
    "subCategory" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activityRequestId" TEXT,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchChallenge_challengedId_status_idx" ON "MatchChallenge"("challengedId", "status");

-- CreateIndex
CREATE INDEX "MatchChallenge_challengerId_status_idx" ON "MatchChallenge"("challengerId", "status");

-- AddForeignKey
ALTER TABLE "MatchChallenge" ADD CONSTRAINT "MatchChallenge_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchChallenge" ADD CONSTRAINT "MatchChallenge_challengedId_fkey" FOREIGN KEY ("challengedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchChallenge" ADD CONSTRAINT "MatchChallenge_activityRequestId_fkey" FOREIGN KEY ("activityRequestId") REFERENCES "ActivityRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
