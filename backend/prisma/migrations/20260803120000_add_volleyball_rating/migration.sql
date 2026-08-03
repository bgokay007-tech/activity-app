-- AlterTable
ALTER TABLE "CoachListing" ADD COLUMN "approvedForRating" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VolleyballRating" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "raterRole" TEXT NOT NULL,
    "serve" INTEGER NOT NULL,
    "receptionPass" INTEGER NOT NULL,
    "spike" INTEGER NOT NULL,
    "block" INTEGER NOT NULL,
    "serveReception" INTEGER NOT NULL,
    "endurance" INTEGER NOT NULL,
    "agility" INTEGER NOT NULL,
    "jump" INTEGER NOT NULL,
    "gameVision" INTEGER NOT NULL,
    "teamCommunication" INTEGER NOT NULL,
    "decisionMaking" INTEGER NOT NULL,
    "strongestPoint" TEXT,
    "weakestPoint" TEXT,
    "generalPerformanceNote" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolleyballRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolleyballRating_subjectId_idx" ON "VolleyballRating"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "VolleyballRating_subjectId_raterId_key" ON "VolleyballRating"("subjectId", "raterId");

-- AddForeignKey
ALTER TABLE "VolleyballRating" ADD CONSTRAINT "VolleyballRating_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolleyballRating" ADD CONSTRAINT "VolleyballRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
