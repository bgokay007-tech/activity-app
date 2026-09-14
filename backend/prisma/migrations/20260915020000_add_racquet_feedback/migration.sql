-- Tenis/padel akran-antrenör geri bildirimi (ELO'ya yazılmaz).
CREATE TABLE "RacquetFeedback" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "subCategory" TEXT NOT NULL,
    "raterRole" TEXT NOT NULL,
    "forehandDrive" INTEGER NOT NULL,
    "backhandDrive" INTEGER NOT NULL,
    "volley" INTEGER NOT NULL,
    "smash" INTEGER NOT NULL,
    "agility" INTEGER NOT NULL,
    "endurance" INTEGER NOT NULL,
    "reflexes" INTEGER NOT NULL,
    "courtPositioning" INTEGER NOT NULL,
    "shotSelection" INTEGER NOT NULL,
    "teamCommunication" INTEGER NOT NULL,
    "strongestPoint" TEXT,
    "weakestPoint" TEXT,
    "generalPerformanceNote" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RacquetFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RacquetFeedback_subjectId_subCategory_idx" ON "RacquetFeedback"("subjectId", "subCategory");
CREATE UNIQUE INDEX "RacquetFeedback_subjectId_raterId_subCategory_key" ON "RacquetFeedback"("subjectId", "raterId", "subCategory");
ALTER TABLE "RacquetFeedback" ADD CONSTRAINT "RacquetFeedback_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RacquetFeedback" ADD CONSTRAINT "RacquetFeedback_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
