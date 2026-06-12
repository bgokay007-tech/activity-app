CREATE TABLE "MatchComment" (
    "id" TEXT NOT NULL,
    "rivalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchComment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "MatchComment" ADD CONSTRAINT "MatchComment_rivalId_fkey" FOREIGN KEY ("rivalId") REFERENCES "ActivityRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchComment" ADD CONSTRAINT "MatchComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
