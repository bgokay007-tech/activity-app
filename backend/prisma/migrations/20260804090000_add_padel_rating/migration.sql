-- AlterTable
ALTER TABLE "UserInterest" ADD COLUMN "selfAssessmentRating" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PadelRating" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
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

    CONSTRAINT "PadelRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PadelRating_subjectId_idx" ON "PadelRating"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "PadelRating_subjectId_raterId_key" ON "PadelRating"("subjectId", "raterId");

-- AddForeignKey
ALTER TABLE "PadelRating" ADD CONSTRAINT "PadelRating_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelRating" ADD CONSTRAINT "PadelRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
