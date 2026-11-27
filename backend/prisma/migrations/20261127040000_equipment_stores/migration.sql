-- CreateTable
CREATE TABLE IF NOT EXISTS "EquipmentStore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "websiteUrl" TEXT NOT NULL,
    "feedUrl" TEXT,
    "logoUrl" TEXT,
    "city" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EquipmentStoreProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "stock" INTEGER,
    "imageUrl" TEXT,
    "productUrl" TEXT,
    "externalId" TEXT,
    "brand" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentStoreProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EquipmentStore_subCategory_status_idx" ON "EquipmentStore"("subCategory", "status");
CREATE INDEX IF NOT EXISTS "EquipmentStore_userId_subCategory_idx" ON "EquipmentStore"("userId", "subCategory");
CREATE INDEX IF NOT EXISTS "EquipmentStoreProduct_storeId_status_idx" ON "EquipmentStoreProduct"("storeId", "status");
CREATE INDEX IF NOT EXISTS "EquipmentStoreProduct_title_idx" ON "EquipmentStoreProduct"("title");

-- CreateUniqueConstraint
DO $$ BEGIN
  ALTER TABLE "EquipmentStoreProduct" ADD CONSTRAINT "EquipmentStoreProduct_storeId_externalId_key" UNIQUE ("storeId", "externalId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EquipmentStore" ADD CONSTRAINT "EquipmentStore_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EquipmentStoreProduct" ADD CONSTRAINT "EquipmentStoreProduct_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "EquipmentStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
