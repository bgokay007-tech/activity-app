-- Uygulama içi bildirimlere ek olarak WhatsApp/Telegram/SMS/E-posta ile de bildirim gönderme tercihi
ALTER TABLE "User" ADD COLUMN "extraNotifyChannel" TEXT;
ALTER TABLE "User" ADD COLUMN "extraNotifyPhone" TEXT;
ALTER TABLE "User" ADD COLUMN "extraNotifyEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramLinkToken" TEXT;
CREATE UNIQUE INDEX "User_telegramLinkToken_key" ON "User"("telegramLinkToken");
