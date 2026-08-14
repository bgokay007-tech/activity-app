-- Sipariş verildiği andaki maçı/ilanı (ActivityRequest.id) izlemek için — işletmeci Sipariş
-- sekmesinde "hangi maç/oyuncu için" bilgisini görebilsin diye. FK değil, soft reference.
ALTER TABLE "VenueOrder" ADD COLUMN "activityId" TEXT;
