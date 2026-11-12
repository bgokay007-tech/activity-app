-- İlan oluştururken "uygulama dışı rezervasyonum var" yolu için bayrak
ALTER TABLE "CourtReservation" ADD COLUMN IF NOT EXISTS "isExternal" BOOLEAN NOT NULL DEFAULT false;
