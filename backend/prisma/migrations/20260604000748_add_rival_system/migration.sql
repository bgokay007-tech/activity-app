-- AlterTable
ALTER TABLE "ActivityRequest" ADD COLUMN     "level" TEXT,
ADD COLUMN     "location" TEXT,
ALTER COLUMN "receiverId" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'OPEN';
