-- Üyelikten ayrılma: Arşiv > Salonlar geçmiş üyelikleri LEFT + endedAt ile listeler.
ALTER TABLE "ClubMembershipApplication" ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMP(3);
