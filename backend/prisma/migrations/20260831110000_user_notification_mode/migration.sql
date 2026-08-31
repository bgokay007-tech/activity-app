-- Kullanıcının merkezi bildirim modu: MUTE | VIBRATE | SOUND
ALTER TABLE "User" ADD COLUMN "notificationMode" TEXT NOT NULL DEFAULT 'SOUND';
