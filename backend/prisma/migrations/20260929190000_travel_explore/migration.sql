-- CreateTable
CREATE TABLE "TravelRoute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startPlace" TEXT NOT NULL,
    "endPlace" TEXT,
    "stops" JSONB NOT NULL DEFAULT '[]',
    "distanceKm" DOUBLE PRECISION,
    "durationText" TEXT,
    "difficulty" TEXT,
    "experience" TEXT,
    "media" JSONB NOT NULL DEFAULT '[]',
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRouteReview" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "media" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelRouteReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelTrip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromPlace" TEXT NOT NULL,
    "toPlace" TEXT NOT NULL,
    "waypoints" JSONB NOT NULL DEFAULT '[]',
    "departAt" TIMESTAMP(3) NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "pricePerSeat" INTEGER NOT NULL DEFAULT 0,
    "vehicle" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelTripRequest" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelTripRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "tcKimlikNo" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "idCardUrl" TEXT NOT NULL,
    "adliSicilUrl" TEXT NOT NULL,
    "selfieUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelRoute_createdAt_idx" ON "TravelRoute"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravelRouteReview_routeId_userId_key" ON "TravelRouteReview"("routeId", "userId");

-- CreateIndex
CREATE INDEX "TravelTrip_departAt_idx" ON "TravelTrip"("departAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravelTripRequest_tripId_userId_key" ON "TravelTripRequest"("tripId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelVerification_userId_key" ON "TravelVerification"("userId");

-- AddForeignKey
ALTER TABLE "TravelRoute" ADD CONSTRAINT "TravelRoute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRouteReview" ADD CONSTRAINT "TravelRouteReview_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TravelRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRouteReview" ADD CONSTRAINT "TravelRouteReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelTrip" ADD CONSTRAINT "TravelTrip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelTripRequest" ADD CONSTRAINT "TravelTripRequest_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TravelTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelTripRequest" ADD CONSTRAINT "TravelTripRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelVerification" ADD CONSTRAINT "TravelVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
