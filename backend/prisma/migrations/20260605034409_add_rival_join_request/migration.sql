-- CreateTable
CREATE TABLE "RivalJoinRequest" (
    "id" TEXT NOT NULL,
    "rivalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RivalJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RivalJoinRequest_rivalId_userId_key" ON "RivalJoinRequest"("rivalId", "userId");

-- AddForeignKey
ALTER TABLE "RivalJoinRequest" ADD CONSTRAINT "RivalJoinRequest_rivalId_fkey" FOREIGN KEY ("rivalId") REFERENCES "ActivityRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RivalJoinRequest" ADD CONSTRAINT "RivalJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
