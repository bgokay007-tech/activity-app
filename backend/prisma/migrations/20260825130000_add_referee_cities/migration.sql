-- AlterTable
ALTER TABLE "RefereeListing" ADD COLUMN "cities" JSONB;
ALTER TABLE "RefereeListing" ALTER COLUMN "location" DROP NOT NULL;
