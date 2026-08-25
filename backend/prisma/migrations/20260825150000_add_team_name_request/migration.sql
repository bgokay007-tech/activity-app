-- CreateTable
CREATE TABLE "TeamNameRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "receiptUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamNameRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TeamNameRequest" ADD CONSTRAINT "TeamNameRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Onaylanan bir takım adı (büyük/küçük harf farksız) tek başına o kullanıcıya ait olur — bu
-- kısmi unique index SADECE status='APPROVED' satırlar arasında geçerli, aynı isim için
-- birden fazla PENDING/REJECTED kaydı engellemez (ör. reddedilen biri tekrar deneyebilir).
CREATE UNIQUE INDEX "TeamNameRequest_approved_teamName_lower_key" ON "TeamNameRequest" (LOWER("teamName")) WHERE "status" = 'APPROVED';
