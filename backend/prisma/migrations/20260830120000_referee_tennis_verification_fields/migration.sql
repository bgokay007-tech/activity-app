-- RefereeListing: tenis hakemliği için TTF i-KORT sistemiyle uyumlu resmi lisans/kademe/
-- doğrulama alanları. Hepsi nullable ekleniyor, veri kaybı riski yok.
ALTER TABLE "RefereeListing" ADD COLUMN "ikortNo" TEXT;
ALTER TABLE "RefereeListing" ADD COLUMN "refereeKademe" TEXT;
ALTER TABLE "RefereeListing" ADD COLUMN "vizeBelgesiUrl" TEXT;
ALTER TABLE "RefereeListing" ADD COLUMN "itfBadgeLevel" TEXT;
ALTER TABLE "RefereeListing" ADD COLUMN "itfCertNo" TEXT;
ALTER TABLE "RefereeListing" ADD COLUMN "adliSicilUrl" TEXT;
ALTER TABLE "RefereeListing" ADD COLUMN "cezaBelgesiUrl" TEXT;
ALTER TABLE "RefereeListing" ADD COLUMN "ilTemsilciligi" TEXT;
ALTER TABLE "RefereeListing" ADD COLUMN "specialization" JSONB;
