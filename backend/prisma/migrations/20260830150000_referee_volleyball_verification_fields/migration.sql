-- RefereeListing: voleybol hakemliği için TVF sistemiyle uyumlu doğrulama alanları.
-- ikortNo/refereeKademe/vizeBelgesiUrl/ilTemsilciligi/specialization tenisle aynı sütunlar
-- üzerinden paylaşılıyor (bkz. 20260830120000_referee_tennis_verification_fields), burada
-- sadece voleybole özel 3 yeni alan ekleniyor. Hepsi nullable/default'lu, veri kaybı riski yok.
ALTER TABLE "RefereeListing" ADD COLUMN "vizeAktif" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RefereeListing" ADD COLUMN "highestLeagueLevel" TEXT;
ALTER TABLE "RefereeListing" ADD COLUMN "recentMatchesUrl" TEXT;
