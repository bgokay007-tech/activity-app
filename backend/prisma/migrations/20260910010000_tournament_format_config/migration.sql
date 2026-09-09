-- Turnuva format paketi (preset + faz/seeding); motor type '1'..'4' ile çalışmaya devam eder.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "formatConfig" JSONB;
