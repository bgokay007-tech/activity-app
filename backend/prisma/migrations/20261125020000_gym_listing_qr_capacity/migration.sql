-- Fitness etkinlik kontenjanı (bilet linki yerine)
ALTER TABLE "ActivityRequest" ADD COLUMN IF NOT EXISTS "minParticipants" INTEGER;
ALTER TABLE "ActivityRequest" ADD COLUMN IF NOT EXISTS "maxParticipants" INTEGER;

-- Spor salonu ilanları
CREATE TABLE IF NOT EXISTS "GymListing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SPORTS',
    "subCategory" TEXT NOT NULL DEFAULT 'fitness_gym',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "city" TEXT,
    "cities" JSONB,
    "district" TEXT,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "monthlyFee" INTEGER,
    "weeklyFee" INTEGER,
    "dailyFee" INTEGER,
    "memberCount" INTEGER,
    "openTime" TEXT,
    "closeTime" TEXT,
    "squareMeters" INTEGER,
    "lockerMale" INTEGER,
    "lockerFemale" INTEGER,
    "showerMale" INTEGER,
    "showerFemale" INTEGER,
    "wcMale" INTEGER,
    "wcFemale" INTEGER,
    "dressingRoomMale" INTEGER,
    "dressingRoomFemale" INTEGER,
    "equipmentList" TEXT,
    "salesList" TEXT,
    "amenities" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GymListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GymMember" (
    "id" TEXT NOT NULL,
    "gymListingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "qrToken" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GymMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GymCheckIn" (
    "id" TEXT NOT NULL,
    "gymListingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scannedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GymCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymMember_qrToken_key" ON "GymMember"("qrToken");
CREATE UNIQUE INDEX IF NOT EXISTS "GymMember_gymListingId_userId_key" ON "GymMember"("gymListingId", "userId");
CREATE INDEX IF NOT EXISTS "GymCheckIn_gymListingId_createdAt_idx" ON "GymCheckIn"("gymListingId", "createdAt");
CREATE INDEX IF NOT EXISTS "GymCheckIn_memberId_createdAt_idx" ON "GymCheckIn"("memberId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "GymListing" ADD CONSTRAINT "GymListing_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GymMember" ADD CONSTRAINT "GymMember_gymListingId_fkey"
        FOREIGN KEY ("gymListingId") REFERENCES "GymListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GymMember" ADD CONSTRAINT "GymMember_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GymMember" ADD CONSTRAINT "GymMember_addedById_fkey"
        FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GymCheckIn" ADD CONSTRAINT "GymCheckIn_gymListingId_fkey"
        FOREIGN KEY ("gymListingId") REFERENCES "GymListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GymCheckIn" ADD CONSTRAINT "GymCheckIn_memberId_fkey"
        FOREIGN KEY ("memberId") REFERENCES "GymMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "GymCheckIn" ADD CONSTRAINT "GymCheckIn_scannedById_fkey"
        FOREIGN KEY ("scannedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
