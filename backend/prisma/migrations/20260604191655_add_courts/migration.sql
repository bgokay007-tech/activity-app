-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "country" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sport" TEXT NOT NULL DEFAULT 'tennis',
    "surface" TEXT,
    "indoor" BOOLEAN NOT NULL DEFAULT false,
    "fee" BOOLEAN NOT NULL DEFAULT false,
    "lights" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "addedBy" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
