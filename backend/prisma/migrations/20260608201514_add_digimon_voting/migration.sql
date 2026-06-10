-- AlterTable
ALTER TABLE "UserInterest" ADD COLUMN     "digimonVotingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AssessmentVote" (
    "id" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "targetInterestId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentVote_voterId_targetInterestId_questionId_key" ON "AssessmentVote"("voterId", "targetInterestId", "questionId");

-- AddForeignKey
ALTER TABLE "AssessmentVote" ADD CONSTRAINT "AssessmentVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentVote" ADD CONSTRAINT "AssessmentVote_targetInterestId_fkey" FOREIGN KEY ("targetInterestId") REFERENCES "UserInterest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
