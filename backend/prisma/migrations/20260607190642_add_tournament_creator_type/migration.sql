/*
  Warnings:

  - Added the required column `creatorId` to the `Tournament` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "creatorId" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'mix_double',
ALTER COLUMN "maxPlayers" SET DEFAULT 32,
ALTER COLUMN "startDate" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "TournamentParticipant" ADD COLUMN     "note" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
