import prisma from '../config/prisma.js';
import { emitToUser } from '../config/socket.js';
import axios from 'axios';
import { sendExternalNotification } from '../utils/externalNotify.js';

// Bildirimler ekranındaki "Sessize Al" moduna göre Android bildirim kanalını ve sesi seçer —
// kanallar mobil tarafta app açılışında (navigation/index.js) aynı id'lerle önceden kaydedilir.
const CHANNEL_BY_MODE = { MUTE: 'silent', VIBRATE: 'vibrate', SOUND: 'default' };

async function sendPush(pushToken, title, body, data = {}, priority = 'default', notificationMode = 'SOUND') {
    if (!pushToken?.startsWith('ExponentPushToken')) {
        console.warn('[push] invalid token:', pushToken?.substring(0, 30));
        return;
    }
    try {
        const res = await axios.post('https://exp.host/--/api/v2/push/send', {
            to: pushToken, title, body, data, priority,
            sound: notificationMode === 'SOUND' ? 'default' : null,
            channelId: CHANNEL_BY_MODE[notificationMode] || 'default',
            // Mobil tarafta (navigation/index.js) kaydedilen "default_notification" kategorisi —
            // OS bildirim tepsisinde "Okundu İşaretle" butonu, uygulama açılmadan çalışır.
            categoryId: 'default_notification',
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
        const ticket = res.data?.data;
        if (ticket?.status === 'error') {
            console.error('[push] delivery error:', ticket.message, ticket.details);
        } else {
            console.log('[push] sent ok, id:', ticket?.id);
        }
    } catch (e) { console.error('[push] send failed:', e.message); }
}

export const getNotifications = async (req, res, next) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });
        const unreadCount = notifications.filter(n => !n.read).length;
        res.json({ notifications, unreadCount });
    } catch (error) { next(error); }
};

export const markAllRead = async (req, res, next) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.userId, read: false },
            data: { read: true },
        });
        res.json({ message: 'All marked as read' });
    } catch (error) { next(error); }
};

export const markOneRead = async (req, res, next) => {
    try {
        await prisma.notification.updateMany({
            where: { id: req.params.id, userId: req.userId },
            data: { read: true },
        });
        res.json({ message: 'Marked as read' });
    } catch (error) { next(error); }
};

// Helper — called from other controllers
// priority: 'default' | 'high' — Expo push'un Android FCM teslim önceliği. Sadece gerçekten
// aciliyeti olan durumlarda (ör. yedekten asıl kadroya terfi — maçı kaçırmasınlar) 'high' kullan,
// aksi halde varsayılan kalsın (her bildirimi 'high' yapmak anlamını kaybettirir).
export async function createNotification(userId, type, title, body, data = {}, priority = 'default') {
    try {
        const [notif, user] = await Promise.all([
            prisma.notification.create({ data: { userId, type, title, body, data } }),
            prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true, notificationMode: true } }),
        ]);
        emitToUser(userId, 'notification', notif);
        console.log(`[push] user=${userId} hasToken=${!!user?.pushToken}`);
        // notificationId: OS bildirim tepsisindeki "Okundu İşaretle" butonu (bkz. sendPush
        // categoryId) uygulamayı açmadan hangi Notification satırını işaretleyeceğini bundan bilir.
        if (user?.pushToken) sendPush(user.pushToken, title, body, { ...data, type, notificationId: notif.id }, priority, user.notificationMode);
        sendExternalNotification(userId, title, body);
        return notif;
    } catch { /* non-critical */ }
}
