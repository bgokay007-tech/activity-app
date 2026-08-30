-- CoachListing: admin onayi artik suresiz degil (approvedAt uzerinden 1 yil), ve admin
-- onaylarken "su bilgiler eksik, X gun icinde duzeltilmezse iptal edilir" diyebilir
-- (conditionalNote/conditionalDeadline). Hepsi nullable, veri kaybi riski yok.
ALTER TABLE "CoachListing" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "CoachListing" ADD COLUMN "conditionalNote" TEXT;
ALTER TABLE "CoachListing" ADD COLUMN "conditionalDeadline" TIMESTAMP(3);
