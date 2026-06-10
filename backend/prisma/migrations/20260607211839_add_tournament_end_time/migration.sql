/*
  Warnings:

  - You are about to drop the column `duration` on the `Tournament` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Tournament" DROP COLUMN "duration",
ADD COLUMN     "endTime" TEXT;
