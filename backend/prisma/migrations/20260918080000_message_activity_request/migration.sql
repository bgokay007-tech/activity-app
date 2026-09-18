-- AlterTable
ALTER TABLE "Message" ADD COLUMN "activityRequestId" TEXT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_activityRequestId_fkey" FOREIGN KEY ("activityRequestId") REFERENCES "ActivityRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
