-- Add payment fields to Tournament
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "feeType"       TEXT;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "playerFee"     DOUBLE PRECISION;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "ibanNumber"    TEXT;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "ibanHolder"    TEXT;
