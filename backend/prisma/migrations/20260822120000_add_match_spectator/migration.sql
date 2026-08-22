-- CreateTable
CREATE TABLE "MatchSpectator" (
    "id" TEXT NOT NULL,
    "activityRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSpectator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchSpectator_activityRequestId_userId_key" ON "MatchSpectator"("activityRequestId", "userId");

-- AddForeignKey
ALTER TABLE "MatchSpectator" ADD CONSTRAINT "MatchSpectator_activityRequestId_fkey" FOREIGN KEY ("activityRequestId") REFERENCES "ActivityRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSpectator" ADD CONSTRAINT "MatchSpectator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
