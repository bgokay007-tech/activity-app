CREATE TABLE "EquipmentListing" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "category"    TEXT NOT NULL,
    "subCategory" TEXT NOT NULL,
    "condition"   TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "price"       INTEGER NOT NULL DEFAULT 0,
    "images"      JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "location"    TEXT,
    "city"        TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentListing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EquipmentListing_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
