import prisma from '../config/prisma.js';
import { respondToJoin, cancelMatch, confirmScore } from '../controllers/rival.controller.js';
import { invokeControllerAs } from '../utils/internalInvoke.js';

const AUTO_RESPOND_DELAY_MS = 20 * 1000;

// Sahibin (kurucu) davet ettiği demo botlar (kurucu takıma/rakibe/yedeğe/atanmamış havuza
// davet — initiatedBy=OWNER) 20 saniye sonra otomatik kabul eder; demoAutoReject=true olan
// (her cinsiyetten ilk 2 kişi) her zaman reddeder — kullanıcı hem başarı hem red senaryosunu
// test edebilsin diye.
async function respondPendingInvites() {
    const cutoff = new Date(Date.now() - AUTO_RESPOND_DELAY_MS);
    const pending = await prisma.rivalJoinRequest.findMany({
        where: { status: 'PENDING', initiatedBy: 'OWNER', createdAt: { lte: cutoff }, user: { isDemoUser: true } },
        select: { id: true, userId: true, user: { select: { demoAutoReject: true } } },
    });
    for (const jr of pending) {
        try {
            await invokeControllerAs(respondToJoin, {
                userId: jr.userId,
                params: { requestId: jr.id },
                body: { action: jr.user.demoAutoReject ? 'reject' : 'accept' },
            });
        } catch (e) {
            console.error('[demoBot] respond error:', e.message);
        }
    }
}

// Karşılıklı iptal: bir demo bot maçtaysa ve karşı taraf mutual cancel istediyse, botun bu
// isteği "ilk gördüğü an"dan (bellekte tutulur, sunucu yeniden başlarsa sıfırlanır — test
// aracı olduğu için sorun değil) 20 saniye sonra bot da onaylar.
const mutualCancelFirstSeen = new Map(); // rivalId -> ms

async function respondMutualCancels() {
    const matched = await prisma.activityRequest.findMany({
        where: { status: 'MATCHED', subCategory: 'volleyball' },
        select: { id: true, mutualCancelRequests: true, senderId: true, senderTeam: true, participants: true },
    });
    const now = Date.now();
    const stillPendingIds = new Set();

    for (const rival of matched) {
        const mutualReqs = Array.isArray(rival.mutualCancelRequests) ? rival.mutualCancelRequests : [];
        if (mutualReqs.length === 0) continue;
        const senderTeamIds = (Array.isArray(rival.senderTeam) ? rival.senderTeam : []).filter(p => p?.id).map(p => p.id);
        const participantIds = (Array.isArray(rival.participants) ? rival.participants : []).filter(p => p?.id).map(p => p.id);
        const allPlayerIds = [rival.senderId, ...senderTeamIds, ...participantIds];
        const waitingIds = allPlayerIds.filter(id => !mutualReqs.includes(id));
        if (waitingIds.length === 0) continue;

        const demoUsers = await prisma.user.findMany({ where: { id: { in: waitingIds }, isDemoUser: true }, select: { id: true } });
        if (demoUsers.length === 0) continue;

        stillPendingIds.add(rival.id);
        if (!mutualCancelFirstSeen.has(rival.id)) mutualCancelFirstSeen.set(rival.id, now);
        if (now - mutualCancelFirstSeen.get(rival.id) < AUTO_RESPOND_DELAY_MS) continue;

        for (const u of demoUsers) {
            try {
                await invokeControllerAs(cancelMatch, { userId: u.id, params: { id: rival.id }, body: { mutual: true } });
            } catch (e) {
                console.error('[demoBot] mutual cancel error:', e.message);
            }
        }
    }

    for (const key of mutualCancelFirstSeen.keys()) {
        if (!stillPendingIds.has(key)) mutualCancelFirstSeen.delete(key);
    }
}

// Kullanıcı isteği: "botlar skorları otomatik onaylamaya ayarlı olsun test için kullanıyorum
// sonuçta botları" — skoru rakip taraf (scoreEnteredBy'ın olmadığı taraf) girdi, o tarafta
// demo bot varsa 20 saniye sonra bot onaylar. Onay TEK kişilik yeterli (bkz. confirmScore),
// bu yüzden karşı taraftaki ilk demo bot yeterli.
async function respondPendingScores() {
    const cutoff = new Date(Date.now() - AUTO_RESPOND_DELAY_MS);
    const pending = await prisma.activityRequest.findMany({
        where: { scoreStatus: 'PENDING', completedAt: { lte: cutoff } },
        select: { id: true, senderId: true, senderTeam: true, participants: true, scoreEnteredBy: true },
    });
    for (const rival of pending) {
        const senderTeamIds = (Array.isArray(rival.senderTeam) ? rival.senderTeam : []).filter(p => p?.id).map(p => p.id);
        const participantIds = (Array.isArray(rival.participants) ? rival.participants : []).filter(p => p?.id).map(p => p.id);
        const teamAIds = [rival.senderId, ...senderTeamIds];
        const scorerInA = teamAIds.includes(rival.scoreEnteredBy);
        const confirmSideIds = scorerInA ? participantIds : teamAIds;
        if (confirmSideIds.length === 0) continue;

        const demoUser = await prisma.user.findFirst({ where: { id: { in: confirmSideIds }, isDemoUser: true }, select: { id: true } });
        if (!demoUser) continue;

        try {
            await invokeControllerAs(confirmScore, { userId: demoUser.id, params: { id: rival.id }, body: {} });
        } catch (e) {
            console.error('[demoBot] confirm score error:', e.message);
        }
    }
}

async function tick() {
    try { await respondPendingInvites(); } catch (e) { console.error('[demoBot] invite tick error:', e.message); }
    try { await respondMutualCancels(); } catch (e) { console.error('[demoBot] mutual tick error:', e.message); }
    try { await respondPendingScores(); } catch (e) { console.error('[demoBot] score tick error:', e.message); }
}

export function startDemoBotResponderJob() {
    tick();
    setInterval(tick, 5000);
    console.log('🤖 Demo bot auto-responder job started (20s gecikmeyle her 5s kontrol)');
}
