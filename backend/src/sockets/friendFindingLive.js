import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { haversineKm } from '../utils/geo.js';

// Arkadaş Bulma — Canlı Eşleş (WebRTC): Batak/Tavla ile aynı mimari desen (bellekte
// kuyruk + eşleştirme, JWT ile kimlik doğrulama, socket.io sadece SDP/ICE sinyallerini
// iki tarafın arasında AYNEN iletiyor — medya akışı sunucudan hiç geçmiyor, doğrudan
// P2P). Kamera izni veren + kuyrukta olan iki kullanıcı, mevcut Arkadaş Bulma
// kısıtlamalarıyla (mesafe/yaş/cinsiyet/seekingFilter — bkz. friendFinding.controller.js
// getCandidates, aynı kurallar burada da uygulanıyor, KARŞILIKLI) eşleşince canlı
// görüntülü bağlantı kuruluyor.

const queue = []; // { userId, socket, profile, user }
const activeSession = new Map(); // userId -> { partnerId, sessionId }
const lastSkipped = new Map(); // userId -> Set(partnerId) — sadece BİR sonraki eşleştirme denemesinde hariç tutulur

function compatibleSeekings(seeking) {
    if (seeking === 'BOTH') return ['FRIENDS', 'PARTNER', 'BOTH'];
    return [seeking, 'BOTH'];
}

function ageFromBirthDate(birthDate) {
    if (!birthDate) return null;
    return Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000));
}

// A'nın filtresi B'yi kabul ediyor mu (tek yön) — mevcut getCandidates ile aynı kurallar.
function accepts(a, b) {
    if (!b.profile?.active) return false;
    if (a.profile.seekingFilter && !compatibleSeekings(a.profile.seekingFilter).includes(b.profile.seeking)) return false;
    const distanceKm = haversineKm(a.user.lat, a.user.lng, b.user.lat, b.user.lng);
    if (distanceKm > (a.profile.maxDistanceKm || 50)) return false;
    const age = ageFromBirthDate(b.user.birthDate);
    if (a.profile.ageMin && age !== null && age < a.profile.ageMin) return false;
    if (a.profile.ageMax && age !== null && age > a.profile.ageMax) return false;
    const pref = Array.isArray(a.profile.genderPref) ? a.profile.genderPref : [];
    if (pref.length > 0 && b.user.gender && !pref.includes(b.user.gender)) return false;
    return true;
}

function mutuallyCompatible(a, b) {
    return accepts(a, b) && accepts(b, a);
}

async function tryMatch(io) {
    for (let i = 0; i < queue.length; i++) {
        const a = queue[i];
        for (let j = i + 1; j < queue.length; j++) {
            const b = queue[j];
            const skippedByA = lastSkipped.get(a.userId);
            if (skippedByA?.has(b.userId) && queue.length > 2) continue; // alternatif varsa aynı kişiyle tekrar eşleştirme
            if (!mutuallyCompatible(a, b)) continue;

            queue.splice(j, 1);
            queue.splice(i, 1);
            lastSkipped.delete(a.userId);
            lastSkipped.delete(b.userId);

            const sessionId = `${a.userId}-${b.userId}-${Date.now()}`;
            activeSession.set(a.userId, { partnerId: b.userId, sessionId });
            activeSession.set(b.userId, { partnerId: a.userId, sessionId });

            // Camlı görüşmeyi kim başlatacak (offer/answer glare'ını önlemek için) sabit bir
            // kural: userId'si küçük olan taraf offer'ı gönderir.
            const [initiatorId] = [a.userId, b.userId].sort();
            a.socket.emit('ff:live:matched', {
                sessionId, partner: { id: b.userId, username: b.user.username, fullName: b.user.fullName, avatar: b.user.avatar },
                isInitiator: initiatorId === a.userId,
            });
            b.socket.emit('ff:live:matched', {
                sessionId, partner: { id: a.userId, username: a.user.username, fullName: a.user.fullName, avatar: a.user.avatar },
                isInitiator: initiatorId === b.userId,
            });
            return tryMatch(io); // kalanlarla devam et
        }
    }
}

function leaveQueue(userId) {
    const idx = queue.findIndex(q => q.userId === userId);
    if (idx !== -1) queue.splice(idx, 1);
}

function endSession(io, userId, { notifyPartner = true, reason = 'left' } = {}) {
    const session = activeSession.get(userId);
    if (!session) return;
    activeSession.delete(userId);
    activeSession.delete(session.partnerId);
    if (notifyPartner) io.to(`user:${session.partnerId}`).emit('ff:live:ended', { reason });
    return session;
}

export function registerFriendFindingLiveHandlers(io, socket) {
    let verifiedUserId = null;
    try {
        const token = socket.handshake.auth?.token;
        if (token) verifiedUserId = jwt.verify(token, JWT_SECRET).userId;
    } catch { /* token yoksa/geçersizse canlı eşleşme kullanılamaz */ }

    socket.on('ff:live:ready', async () => {
        if (!verifiedUserId) return socket.emit('ff:live:error', { message: 'Oturum doğrulanamadı' });
        if (activeSession.has(verifiedUserId)) return;
        if (queue.some(q => q.userId === verifiedUserId)) return;

        const [user, profile] = await Promise.all([
            prisma.user.findUnique({ where: { id: verifiedUserId }, select: { id: true, username: true, fullName: true, avatar: true, gender: true, birthDate: true, lat: true, lng: true } }),
            prisma.friendFindingProfile.findUnique({ where: { userId: verifiedUserId } }),
        ]);
        if (!profile) return socket.emit('ff:live:error', { message: 'Önce Arkadaş Bulma anketini tamamlamalısın' });
        if (!profile.active) return socket.emit('ff:live:error', { message: 'Arkadaş Bulma profilin kapalı — önce ana ekrandan aç' });
        if (user.lat == null || user.lng == null) return socket.emit('ff:live:error', { message: 'Konum gerekli' });

        queue.push({ userId: verifiedUserId, socket, user, profile });
        socket.emit('ff:live:queued');
        tryMatch(io);
    });

    socket.on('ff:live:cancel', () => {
        leaveQueue(verifiedUserId);
        endSession(io, verifiedUserId);
    });

    // WebRTC sinyalleşmesi — sunucu içeriği hiç incelemeden, sadece o an eşleşmiş olduğu
    // partnere aynen iletiyor (offer/answer/ICE).
    const relay = (event) => ({ sdp, candidate } = {}) => {
        const session = activeSession.get(verifiedUserId);
        if (!session) return;
        io.to(`user:${session.partnerId}`).emit(event, sdp !== undefined ? { sdp } : { candidate });
    };
    socket.on('ff:live:offer', relay('ff:live:offer'));
    socket.on('ff:live:answer', relay('ff:live:answer'));
    socket.on('ff:live:ice-candidate', relay('ff:live:ice-candidate'));

    // Sağa kaydır / geç — bu görüşmeyi PASS olarak kaydeder, oturumu bitirir, ikisi de
    // kuyruğa geri döner (kullanıcı isteği: başka aday yoksa yine aynı kişiyle eşleşebilir).
    socket.on('ff:live:skip', async () => {
        const session = endSession(io, verifiedUserId, { reason: 'skipped' });
        if (!session) return;
        try {
            await prisma.friendFindingSwipe.upsert({
                where: { swiperId_targetId: { swiperId: verifiedUserId, targetId: session.partnerId } },
                update: { decision: 'PASS' },
                create: { swiperId: verifiedUserId, targetId: session.partnerId, decision: 'PASS' },
            });
        } catch { /* yut — kayıt kritik değil */ }
        if (!lastSkipped.has(verifiedUserId)) lastSkipped.set(verifiedUserId, new Set());
        lastSkipped.get(verifiedUserId).add(session.partnerId);
    });

    // Beğen — karşı taraf da beğenirse eşleşme oluşur (mevcut swipe akışıyla birebir aynı
    // mantık: LIKE kaydı + karşılıklı kontrol + FriendFindingMatch).
    socket.on('ff:live:like', async () => {
        const session = activeSession.get(verifiedUserId);
        if (!session) return;
        const targetId = session.partnerId;
        try {
            await prisma.friendFindingSwipe.upsert({
                where: { swiperId_targetId: { swiperId: verifiedUserId, targetId } },
                update: { decision: 'LIKE' },
                create: { swiperId: verifiedUserId, targetId, decision: 'LIKE' },
            });
            io.to(`user:${targetId}`).emit('ff:live:partner-liked');

            const reverseLike = await prisma.friendFindingSwipe.findUnique({
                where: { swiperId_targetId: { swiperId: targetId, targetId: verifiedUserId } },
            });
            if (!reverseLike || reverseLike.decision !== 'LIKE') return;

            const [user1Id, user2Id] = [verifiedUserId, targetId].sort();
            const match = await prisma.friendFindingMatch.upsert({
                where: { user1Id_user2Id: { user1Id, user2Id } },
                update: { status: 'ACTIVE', unmatchedAt: null, unmatchedById: null },
                create: { user1Id, user2Id },
            });

            endSession(io, verifiedUserId, { notifyPartner: false });
            activeSession.delete(targetId);
            io.to(`user:${verifiedUserId}`).emit('ff:live:matched-mutual', { matchId: match.id, otherUserId: targetId });
            io.to(`user:${targetId}`).emit('ff:live:matched-mutual', { matchId: match.id, otherUserId: verifiedUserId });

            const [me, other] = await Promise.all([
                prisma.user.findUnique({ where: { id: verifiedUserId }, select: { username: true, fullName: true } }),
                prisma.user.findUnique({ where: { id: targetId }, select: { username: true, fullName: true } }),
            ]);
            createNotification(targetId, 'FRIEND_FINDING_MATCH', '🎉 Yeni bir eşleşmen var!', `${me?.fullName || me?.username} ile eşleştin. Artık mesajlaşabilirsiniz.`, { matchId: match.id, otherUserId: verifiedUserId }).catch(() => {});
            createNotification(verifiedUserId, 'FRIEND_FINDING_MATCH', '🎉 Yeni bir eşleşmen var!', `${other?.fullName || other?.username} ile eşleştin. Artık mesajlaşabilirsiniz.`, { matchId: match.id, otherUserId: targetId }).catch(() => {});
        } catch { /* yut */ }
    });

    socket.on('disconnect', () => {
        leaveQueue(verifiedUserId);
        endSession(io, verifiedUserId);
    });
}
