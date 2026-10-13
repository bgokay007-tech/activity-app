-- CreateTable
CREATE TABLE "MatchVideo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityRequestId" TEXT,
    "subCategory" TEXT NOT NULL DEFAULT 'tennis',
    "status" TEXT NOT NULL DEFAULT 'UPLOADING',
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "doubles" BOOLEAN NOT NULL DEFAULT false,
    "calibration" JSONB,
    "players" JSONB,
    "result" JSONB,
    "error" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchVideo_userId_createdAt_idx" ON "MatchVideo"("userId", "createdAt");
CREATE INDEX "MatchVideo_status_idx" ON "MatchVideo"("status");
CREATE INDEX "MatchVideo_activityRequestId_idx" ON "MatchVideo"("activityRequestId");
