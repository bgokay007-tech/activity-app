-- Turnuva YEREL kapsamda birden fazla il/ilçe (CoachListing.cities ile aynı desen)
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "cities" JSONB;
