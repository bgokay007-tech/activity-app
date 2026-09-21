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
            to: pushToken,
            priority,
            // KASITLI OLARAK top-level title/body YOK -- bkz. message.controller.js
            // sendPushNotification'daki aynı not: Expo'ya top-level title/body verilirse FCM
            // tarafında bir "notification" alanı oluşuyor ve Android, uygulama arka
            // plandayken/kapalıyken onMessageReceived'i hiç çağırmadan OS'un kendi otomatik
            // bildirimiyle gösteriyor, "Okundu İşaretle" butonu hiç eklenemiyor. Saf "data" mesajı
            // ile bildirimi her zaman native tarafta (NotifActionsMessagingService.kt) biz kuruyoruz.
            data: {
                title,
                message: body,
                channelId: CHANNEL_BY_MODE[notificationMode] || 'default',
                ...data,
            },
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
        // Self-heal: skor zaten girilmiş (NONE değil) maçların SCORE_ENTRY_REQUIRED
        // satırları hâlâ okunmadıysa burada düzelt — kullanıcı skor girdikten sonra
        // eski deploy / kaçan işaret yüzünden takılı kalan satırlar Bildirimler açılınca
        // (veya rozet poll'unda) otomatik okundu olur.
        await healStaleScoreEntryRequired(req.userId);

        const notifications = await prisma.notification.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });
        const unreadCount = notifications.filter(n => !n.read).length;
        res.json({ notifications, unreadCount });
    } catch (error) { next(error); }
};

async function healStaleScoreEntryRequired(userId) {
    try {
        const unread = await prisma.notification.findMany({
            where: { userId, type: 'SCORE_ENTRY_REQUIRED', read: false },
            select: { id: true, data: true },
            take: 50,
        });
        if (unread.length === 0) return;
        const rivalIds = [...new Set(unread.map(n => {
            const d = n.data;
            if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
            return d.rivalId ?? d.rival_id ?? null;
        }).filter(Boolean).map(String))];
        if (rivalIds.length === 0) return;
        const scored = await prisma.activityRequest.findMany({
            where: { id: { in: rivalIds }, scoreStatus: { not: 'NONE' } },
            select: { id: true },
        });
        const scoredSet = new Set(scored.map(r => String(r.id)));
        const toMark = unread.filter(n => {
            const d = n.data;
            const rid = d && typeof d === 'object' && !Array.isArray(d) ? (d.rivalId ?? d.rival_id) : null;
            return rid != null && scoredSet.has(String(rid));
        });
        if (toMark.length === 0) return;
        await prisma.notification.updateMany({
            where: { id: { in: toMark.map(n => n.id) } },
            data: { read: true },
        });
        for (const n of toMark) {
            emitToUser(userId, 'notificationRead', {
                id: n.id,
                type: 'SCORE_ENTRY_REQUIRED',
                data: n.data,
                read: true,
            });
        }
        console.log(`[notif] healStaleScoreEntryRequired: marked=${toMark.length} user=${userId}`);
    } catch (e) {
        console.warn('[notif] healStaleScoreEntryRequired failed:', e.message);
    }
}

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
        // İstemci { read: false } gönderirse tek bildirimi tekrar okunmadı yapabilir —
        // "hepsini okundu" zorlamadan, diğerlerini unutmamak için seçici kullanım.
        const read = req.body?.read === false ? false : true;
        await prisma.notification.updateMany({
            where: { id: req.params.id, userId: req.userId },
            data: { read },
        });
        res.json({ message: read ? 'Marked as read' : 'Marked as unread', read });
    } catch (error) { next(error); }
};

// Kullanıcı isteği: skor girilince "📝 Skorunuzu Girin" (SCORE_ENTRY_REQUIRED) bildirimi
// sayfa yenilenmeden okundu olsun — DB'de işaretle + her etkilenen kullanıcıya socket ile
// anında yansıt (mobil badge + Bildirimler listesi dinliyor).
// Not: Prisma JsonFilter `path/equals` bazı kayıtlarda eşleşmiyor / hata fırlatabiliyor;
// bu yüzden tip+okunmadı ile çekip rivalId'yi JS'te karşılaştırıyoruz (sessiz fail yok).
export async function markScoreEntryRequiredRead(rivalId, onlyUserId = null) {
    if (!rivalId) return { marked: 0 };
    try {
        const unread = await prisma.notification.findMany({
            where: {
                type: 'SCORE_ENTRY_REQUIRED',
                read: false,
                ...(onlyUserId ? { userId: onlyUserId } : {}),
            },
            select: { id: true, userId: true, type: true, data: true },
            take: 300,
        });
        const matched = unread.filter(n => {
            const d = n.data;
            if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
            const rid = d.rivalId ?? d.rival_id;
            return rid != null && String(rid) === String(rivalId);
        });
        if (matched.length === 0) {
            console.log(`[notif] markScoreEntryRequiredRead: no match rivalId=${rivalId} scanned=${unread.length}`);
            return { marked: 0 };
        }
        await prisma.notification.updateMany({
            where: { id: { in: matched.map(n => n.id) } },
            data: { read: true },
        });
        for (const n of matched) {
            emitToUser(n.userId, 'notificationRead', {
                id: n.id,
                type: n.type,
                data: n.data,
                read: true,
            });
        }
        console.log(`[notif] markScoreEntryRequiredRead: marked=${matched.length} rivalId=${rivalId}`);
        return { marked: matched.length };
    } catch (e) {
        console.warn('[notif] markScoreEntryRequiredRead failed:', e.message);
        return { marked: 0, error: e.message };
    }
}

// Skoru giren istemci yedek çağrı — enterScore zaten işaretler; socket kaçarsa / eski
// deploy'da kalmışsa mobil bu endpoint ile kendi SCORE_ENTRY_REQUIRED satırını okur.
export const markMyScoreEntryRequiredRead = async (req, res, next) => {
    try {
        const rivalId = req.body?.rivalId || req.params?.rivalId;
        if (!rivalId) return res.status(400).json({ message: 'rivalId required' });
        const result = await markScoreEntryRequiredRead(rivalId, req.userId);
        res.json(result);
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
