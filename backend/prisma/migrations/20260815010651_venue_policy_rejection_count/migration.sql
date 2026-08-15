-- Pro/Premium işletmelerin reddettiği politika-dışı iptal/değişiklik talebi sayısı (kalıcı).
ALTER TABLE "User" ADD COLUMN "venuePolicyRejectionCount" INTEGER NOT NULL DEFAULT 0;
