-- Pro olmayan tesislerde, tesisin kendi online rezervasyon/web sitesine link verilebilsin diye
-- BusinessVenue'ye website alanı eklendi.
ALTER TABLE "BusinessVenue" ADD COLUMN "website" TEXT;
