-- AlterTable
ALTER TABLE "ActivityRequest" ADD COLUMN     "positions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "refereePayment" TEXT;
