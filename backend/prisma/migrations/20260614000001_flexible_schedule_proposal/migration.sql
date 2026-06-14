-- Add schedule proposal fields for flexible matches
ALTER TABLE "ActivityRequest" ADD COLUMN IF NOT EXISTS "scheduleProposal" JSONB;
ALTER TABLE "ActivityRequest" ADD COLUMN IF NOT EXISTS "schedulingDeadline" TIMESTAMP(3);
