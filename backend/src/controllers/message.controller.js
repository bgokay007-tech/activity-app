import prisma from '../config/prisma.js';
import axios from 'axios';
import { emitToUser } from '../config/socket.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

async function getOrCreateConversation(user1Id, user2Id) {
    const [a, b] = [user1Id, user2Id].sort();
    return prisma.conversation.upsert({
        where: { user1Id_user2Id: { user1Id: a, user2Id: b } },
        create: { user1Id: a, user2Id: b },
        update: { updatedAt: new Date() },
        include: {
            user1: { select: USER_SELECT },
            user2: { select: USER_SELECT },
        },
    });
}

async function isConversationMuted(userId, conversationId) {
    const mute = await prisma.conversationMute.findUnique({
        where: { userId_conversationId: { userId, conversationId } },
    });
    if (!mute) return false;
    return mute.mutedUntil === null || mute.mutedUntil > new Date();
}

// Bildirimler ekranındaki "Sessize Al" moduna göre Android bildirim kanalını ve sesi seçer —
// kanallar mobil tarafta app açılışında (navigation/index.js) aynı id'lerle önceden kaydedilir.
const CHANNEL_BY_MODE = { MUTE: 'silent', VIBRATE: 'vibrate', SOUND: 'default' };

async function sendPushNotification(pushToken, title, body, notificationMode = 'SOUND', data = {}) {
    if (!pushToken?.startsWith('ExponentPushToken')) return;
    console.log('[push] DEBUG full token:', pushToken, 'payload data:', JSON.stringify(data));
    try {
        const debugRes = await axios.post('https://exp.host/--/api/v2/push/send', {
            to: pushToken,
            title,
            body,
            sound: notificationMode === 'SOUND' ? 'default' : null,
            channelId: CHANNEL_BY_MODE[notificationMode] || 'default',
            // Mobil tarafta (navigation/index.js) kaydedilen "message_notification" kategorisi —
            // OS bildirim tepsisinde "Okundu İşaretle" + "Cevapla" (metin girişli) butonları,
            // uygulama açılmadan çalışır (bkz. senderId/conversationId/notificationId altta).
            categoryId: 'message_notification',
            data: { type: 'MESSAGE', ...data },
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
        console.log('[push] DEBUG expo response:', JSON.stringify(debugRes.data));
    } catch (e) { console.log('[push] DEBUG send error:', e.message); }
}

export const getConversations = async (req, res, next) => {
    try {
        const conversations = await prisma.conversation.findMany({
            where: { OR: [{ user1Id: req.userId }, { user2Id: req.userId }] },
            include: {
                user1: { select: USER_SELECT },
                user2: { select: USER_SELECT },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const unreadCounts = conversations.length ? await prisma.message.groupBy({
            by: ['conversationId'],
            where: { conversationId: { in: conversations.map(c => c.id) }, senderId: { not: req.userId }, read: false },
            _count: { id: true },
        }) : [];
        const unreadMap = Object.fromEntries(unreadCounts.map(u => [u.conversationId, u._count.id]));

        const mutes = conversations.length ? await prisma.conversationMute.findMany({
            where: { userId: req.userId, conversationId: { in: conversations.map(c => c.id) } },
        }) : [];
        const muteMap = Object.fromEntries(mutes.map(m => [m.conversationId, m]));

        const now = new Date();
        const result = conversations.map(c => {
            const mute = muteMap[c.id];
            const isMuted = !!mute && (mute.mutedUntil === null || mute.mutedUntil > now);
            return {
                ...c,
                other: c.user1Id === req.userId ? c.user2 : c.user1,
                lastMessage: c.messages[0] || null,
                unreadCount: unreadMap[c.id] || 0,
                isMuted,
                mutedUntil: mute?.mutedUntil || null,
            };
        });

        res.json(result);
    } catch (error) { next(error); }
};

// Sohbeti sessize al — hours verilirse o kadar süreyle, verilmezse süresiz.
export const muteConversation = async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const { hours } = req.body;
        const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conv || (conv.user1Id !== req.userId && conv.user2Id !== req.userId))
            return res.status(403).json({ message: 'Forbidden' });

        const mutedUntil = hours ? new Date(Date.now() + Number(hours) * 3600 * 1000) : null;
        const mute = await prisma.conversationMute.upsert({
            where: { userId_conversationId: { userId: req.userId, conversationId } },
            create: { userId: req.userId, conversationId, mutedUntil },
            update: { mutedUntil },
        });
        res.json(mute);
    } catch (error) { next(error); }
};

export const unmuteConversation = async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        await prisma.conversationMute.deleteMany({ where: { userId: req.userId, conversationId } });
        res.json({ message: 'Unmuted' });
    } catch (error) { next(error); }
};

// Sohbetin içine girmeden, listeden "okundu" olarak işaretle — kullanıcı bunu
// bilinçli seçtiği için gerçekten görüldü sayılır, karşı tarafa da yansır.
export const markConversationRead = async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conv || (conv.user1Id !== req.userId && conv.user2Id !== req.userId))
            return res.status(403).json({ message: 'Forbidden' });

        const now = new Date();
        const { count } = await prisma.message.updateMany({
            where: { conversationId, senderId: { not: req.userId }, read: false },
            data: { read: true, readAt: now },
        });

        res.json({ message: 'Marked as read' });

        if (count > 0) {
            const otherId = conv.user1Id === req.userId ? conv.user2Id : conv.user1Id;
            emitToUser(otherId, 'messagesRead', { conversationId, readAt: now, readerId: req.userId });
        }
    } catch (error) { next(error); }
};

// Alt sekme rozeti (📩) için tüm sohbetlerdeki toplam okunmamış mesaj sayısı —
// bildirim rozetiyle aynı desende (bkz. notification.controller.js), hafif ve
// sık pollanabilir bir uç nokta.
export const getUnreadMessageCount = async (req, res, next) => {
    try {
        const count = await prisma.message.count({
            where: {
                senderId: { not: req.userId },
                read: false,
                conversation: { OR: [{ user1Id: req.userId }, { user2Id: req.userId }] },
            },
        });
        res.json({ unreadCount: count });
    } catch (error) { next(error); }
};

// `before` verilmezse sohbetin EN SON `limit` mesajı döner (binlerce mesajlık bir
// geçmişte bile sohbet her zaman anında en alta/en güncele açılsın diye — tüm
// geçmişi tek seferde çekmek hem yavaş hem de FlatList'in en alta güvenilir
// kaydırmasını neredeyse imkansız kılıyordu). `before` bir mesaj createdAt'ı ise
// ondan önceki `limit` mesaj (eski sayfa, yukarı kaydırınca yüklenir) döner.
export const getMessages = async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const { before } = req.query;
        const take = Math.min(Number(req.query.limit) || 40, 100);

        const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conv || (conv.user1Id !== req.userId && conv.user2Id !== req.userId))
            return res.status(403).json({ message: 'Forbidden' });

        const page = await prisma.message.findMany({
            where: {
                conversationId,
                ...(before && { createdAt: { lt: new Date(before) } }),
                deletions: { none: { userId: req.userId } },
            },
            include: {
                sender: { select: USER_SELECT },
                equipmentListing: { select: { id: true, title: true, price: true, images: true, category: true, subCategory: true, status: true } },
                coachListing: { select: { id: true, credentialLevel: true, certName: true, priceIndividual: true, priceGroup: true, category: true, subCategory: true, status: true } },
            },
            orderBy: { createdAt: 'desc' },
            take,
        });
        const messages = page.reverse(); // ekranda eskiden yeniye göstermek için
        const hasMore = page.length === take;

        // Sadece ilk sayfada (before yokken, yani sohbet yeni açıldığında): karşı
        // tarafın mesajı gerçekten görmesi "okundu" sayılır — mesaj gelince değil.
        // readAt, gönderene "X dakika önce görüldü" göstermek için. Eski sayfalar
        // yukarı kaydırılarak yüklenirken bu tekrar tetiklenmez.
        if (!before) {
            const now = new Date();
            const { count } = await prisma.message.updateMany({
                where: { conversationId, senderId: { not: req.userId }, read: false },
                data: { read: true, readAt: now },
            });

            res.json({ messages, hasMore });

            if (count > 0) {
                const otherId = conv.user1Id === req.userId ? conv.user2Id : conv.user1Id;
                emitToUser(otherId, 'messagesRead', { conversationId, readAt: now, readerId: req.userId });
            }
        } else {
            res.json({ messages, hasMore });
        }
    } catch (error) { next(error); }
};

export const sendMessage = async (req, res, next) => {
    try {
        const { userId: receiverId } = req.params;
        const { content, equipmentListingId, coachListingId, imageUrl, audioUrl, audioDuration } = req.body;

        if (!content?.trim() && !imageUrl && !audioUrl) return res.status(400).json({ message: 'Message cannot be empty' });

        const blocked = await prisma.block.findFirst({
            where: { OR: [{ blockerId: req.userId, blockedId: receiverId }, { blockerId: receiverId, blockedId: req.userId }] },
        });
        if (blocked) return res.status(403).json({ message: blocked.blockerId === req.userId ? 'Bu kullanıcıyı engellediniz.' : 'Bu kullanıcı tarafından engellendiniz.' });

        const msgBlocked = await prisma.messageBlock.findFirst({
            where: { OR: [{ blockerId: req.userId, blockedId: receiverId }, { blockerId: receiverId, blockedId: req.userId }] },
        });
        if (msgBlocked) return res.status(403).json({ message: msgBlocked.blockerId === req.userId ? 'Bu kullanıcının mesajlarını engellediniz.' : 'Bu kullanıcı mesajlarınızı engelledi.' });

        const conv = await getOrCreateConversation(req.userId, receiverId);

        const [message, sender, receiver, muted] = await Promise.all([
            prisma.message.create({
                data: {
                    conversationId: conv.id, senderId: req.userId, content: content?.trim() || '',
                    ...(equipmentListingId && { equipmentListingId }),
                    ...(coachListingId && { coachListingId }),
                    ...(imageUrl && { imageUrl }),
                    ...(audioUrl && { audioUrl, audioDuration: Number(audioDuration) || null }),
                },
                include: {
                    sender: { select: USER_SELECT },
                    equipmentListing: { select: { id: true, title: true, price: true, images: true, category: true, subCategory: true, status: true } },
                    coachListing: { select: { id: true, credentialLevel: true, certName: true, priceIndividual: true, priceGroup: true, category: true, subCategory: true, status: true } },
                },
            }),
            prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } }),
            prisma.user.findUnique({ where: { id: receiverId }, select: { pushToken: true, notificationMode: true } }),
            isConversationMuted(receiverId, conv.id),
        ]);

        res.status(201).json({ message, conversationId: conv.id });

        // Yanıttan hemen sonra — DB yazımlarını beklemeden — socket + push gönder,
        // bildirim gecikmesinin en büyük kaynağı bunların yanıttan önce await edilmesiydi.
        const socketPayload = { message, conversationId: conv.id };
        emitToUser(receiverId, 'newMessage', socketPayload);
        emitToUser(req.userId, 'newMessage', socketPayload);

        prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } }).catch(() => {});

        // Karşı taraf bu sohbeti sessize almışsa (bkz. muteConversation) ne push ne de
        // zil bildirimi gönderilir — Mesajlar sekmesindeki okunmamış rozeti yeterlidir.
        if (muted) return;

        const notifBody = content?.trim() ? content.trim().slice(0, 100) : (message.imageUrl ? '📷 Fotoğraf' : message.audioUrl ? '🎤 Sesli mesaj' : '');
        const senderUsername = sender?.username;
        const notifData = {
            senderId: req.userId, senderUsername, conversationId: conv.id,
            ...(message.equipmentListing && {
                listingId: message.equipmentListing.id,
                category: message.equipmentListing.category,
                subCategory: message.equipmentListing.subCategory,
            }),
            ...(message.coachListing && {
                coachListingId: message.coachListing.id,
                category: message.coachListing.category,
                subCategory: message.coachListing.subCategory,
            }),
        };

        // Kullanıcı isteği: mesajlar için Bildirimler ekranına AYRICA bir satır düşmesin —
        // Mesajlar sekmesindeki okunmamış rozeti (bkz. getUnreadMessageCount) zaten bunu
        // gösteriyor, ikisi birden bilgi kirliliği olurdu. Bu yüzden burada artık
        // prisma.notification.create YOK — sadece gerçek OS push bildirimi gönderiliyor.
        // notificationId push data'sında bilerek yok: notificationActions.js'teki "Okundu
        // İşaretle" zaten data.notificationId olmadan da conversationId üzerinden mesajı
        // okundu işaretliyor (bkz. handleNotificationAction).
        if (receiver?.pushToken) {
            sendPushNotification(receiver.pushToken, `@${senderUsername}`, notifBody, receiver.notificationMode, notifData);
        }
    } catch (error) { next(error); }
};

// forEveryone=true: sadece mesajı gönderen kullanabilir, içerik/medya temizlenir,
// her iki tarafta da "Bu mesaj silindi" yer tutucusu kalır (karşı taraf zaten
// okumuş olsa bile — bunu engellemiyoruz, sadece istemci tarafında uyarı gösterilir).
// forEveryone verilmezse ("Benden Sil"): sohbetteki iki taraftan biri de kendi
// görünümünden silebilir, karşı tarafı etkilemez.
export const deleteMessage = async (req, res, next) => {
    try {
        const { messageId } = req.params;
        const forEveryone = req.query.forEveryone === 'true';

        const message = await prisma.message.findUnique({
            where: { id: messageId },
            include: { conversation: true },
        });
        if (!message) return res.status(404).json({ message: 'Mesaj bulunamadı' });

        const conv = message.conversation;
        if (conv.user1Id !== req.userId && conv.user2Id !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });

        if (forEveryone) {
            if (message.senderId !== req.userId)
                return res.status(403).json({ message: 'Sadece kendi mesajınızı herkesten silebilirsiniz.' });

            await prisma.message.update({
                where: { id: messageId },
                data: { deletedForEveryone: true, content: '', imageUrl: null, audioUrl: null, audioDuration: null },
            });

            const otherId = conv.user1Id === req.userId ? conv.user2Id : conv.user1Id;
            const payload = { messageId, conversationId: conv.id };
            emitToUser(otherId, 'messageDeleted', payload);
            emitToUser(req.userId, 'messageDeleted', payload);
        } else {
            await prisma.messageDeletion.upsert({
                where: { messageId_userId: { messageId, userId: req.userId } },
                create: { messageId, userId: req.userId },
                update: {},
            });
        }

        res.json({ message: 'Deleted' });
    } catch (error) { next(error); }
};

export const getOrStartConversation = async (req, res, next) => {
    try {
        const { userId } = req.params;

        const blocked = await prisma.block.findFirst({
            where: { OR: [{ blockerId: req.userId, blockedId: userId }, { blockerId: userId, blockedId: req.userId }] },
        });
        if (blocked) return res.status(403).json({ message: blocked.blockerId === req.userId ? 'Bu kullanıcıyı engellediniz.' : 'Bu kullanıcı tarafından engellendiniz.' });

        const msgBlocked = await prisma.messageBlock.findFirst({
            where: { OR: [{ blockerId: req.userId, blockedId: userId }, { blockerId: userId, blockedId: req.userId }] },
        });
        if (msgBlocked) return res.status(403).json({ message: msgBlocked.blockerId === req.userId ? 'Bu kullanıcının mesajlarını engellediniz.' : 'Bu kullanıcı mesajlarınızı engelledi.' });

        const conv = await getOrCreateConversation(req.userId, userId);
        res.json(conv);
    } catch (error) { next(error); }
};
