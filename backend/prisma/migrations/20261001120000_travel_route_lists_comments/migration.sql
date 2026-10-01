-- AlterTable
ALTER TABLE "TravelRoute" ADD COLUMN "completedCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TravelRouteComment" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelRouteComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRouteList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelRouteList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRouteListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelRouteListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelRouteComment_routeId_createdAt_idx" ON "TravelRouteComment"("routeId", "createdAt");
CREATE INDEX "TravelRouteList_userId_idx" ON "TravelRouteList"("userId");
CREATE UNIQUE INDEX "TravelRouteListItem_listId_routeId_key" ON "TravelRouteListItem"("listId", "routeId");
CREATE INDEX "TravelRouteListItem_routeId_idx" ON "TravelRouteListItem"("routeId");

-- AddForeignKey
ALTER TABLE "TravelRouteComment" ADD CONSTRAINT "TravelRouteComment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TravelRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TravelRouteComment" ADD CONSTRAINT "TravelRouteComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TravelRouteList" ADD CONSTRAINT "TravelRouteList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TravelRouteListItem" ADD CONSTRAINT "TravelRouteListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "TravelRouteList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TravelRouteListItem" ADD CONSTRAINT "TravelRouteListItem_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TravelRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
