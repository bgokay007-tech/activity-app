-- Destek mesajlarına anında giden resmi otomatik yanıt bayrağı.
-- isAutoReply=true olan admin mesajları gerçek cevap sayılmaz (awaitingAdmin).
ALTER TABLE "SupportMessage" ADD COLUMN IF NOT EXISTS "isAutoReply" BOOLEAN NOT NULL DEFAULT false;
