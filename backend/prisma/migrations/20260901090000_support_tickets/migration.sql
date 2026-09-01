-- Destek mesajlari artik konu (subject) bazli ayri sohbetlere (SupportTicket) baglanabiliyor.
-- Tamamen ekleyici (additive) - eski status/adminReply alanlari ve mevcut satirlar dokunulmadan
-- duruyor, sadece ticketId null olan kayitlar eski sistemden kalan gecmis mesajlar sayiliyor.
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportMessage" ADD COLUMN "ticketId" TEXT;
ALTER TABLE "SupportMessage" ADD COLUMN "isFromAdmin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
