import prisma from '../config/prisma.js';
import { emitToUser } from '../config/socket.js';
import { createNotification } from '../controllers/notification.controller.js';
import { runScoreConfirmation } from '../controllers/rival.controller.js';

export async function autoCompleteExpiredMatches() {
    try {
        const now = new Date();

        const matched = await prisma.activityRequest.findMany({
            where: {
                status: 'MATCHED',
                matchDate: { not: null },
                duration: { not: null },
            },
            select: {
                id: true,
                matchDate: true,
                matchTime: true,
                duration: true,
                senderId: true,
                participants: true,
            },
        });

        const expiredIds = matched
            .filter(r => {
                const d = new Date(r.matchDate);
                if (r.matchTime) {
                    const [h, m] = r.matchTime.split(':').map(Number);
                    d.setHours(h, m, 0, 0);
                }
                d.setTime(d.getTime() + (r.duration || 0) * 60 * 1000);
                return d.getTime() <= now.getTime();
            })
            .map(r => r.id);

        if (expiredIds.length > 0) {
            await prisma.activityRequest.updateMany({
                where: { id: { in: expiredIds } },
                data: { status: 'COMPLETED', archived: true, completedAt: now },
            });

            const updated = await prisma.activityRequest.findMany({
                where: { id: { in: expiredIds } },
                include: { sender: { select: { id: true, username: true, fullName: true, avatar: true } } },
            });

            for (const r of updated) {
                const participants = Array.isArray(r.participants) ? r.participants : [];
                const allIds = new Set([r.senderId, ...participants.map(p => p.id)]);
                for (const uid of allIds) emitToUser(uid, 'rivalUpdate', r);
            }

            console.log(`[autoComplete] Completed ${expiredIds.length} expired match(es)`);
        }
    } catch (err) {
        console.error('[autoComplete] Error:', err.message);
    }
}

// Find opponent matches with no score entered 24h after completion → auto 0-0 draw, no ELO change
export async function autoDrawUnscored() {
    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const unscored = await prisma.activityRequest.findMany({
            where: {
                status: 'COMPLETED',
                matchType: { not: 'PLAYER_WANTED' },
                scoreStatus: 'NONE',
                completedAt: { lte: cutoff },
            },
            select: {
                id: true,
                senderId: true,
                participants: true,
                category: true,
                subCategory: true,
            },
        });

        if (unscored.length === 0) return;

        const drawScore = { sets: [{ sender: 0, opponent: 0 }], winner: 'draw' };

        await prisma.activityRequest.updateMany({
            where: { id: { in: unscored.map(r => r.id) } },
            data: {
                score: drawScore,
                scoreStatus: 'CONFIRMED',
                archived: true,
            },
        });

        const updated = await prisma.activityRequest.findMany({
            where: { id: { in: unscored.map(r => r.id) } },
            include: { sender: { select: { id: true, username: true, fullName: true, avatar: true } } },
        });

        for (const r of updated) {
            const participants = Array.isArray(r.participants) ? r.participants : [];
            const allIds = [...new Set([r.senderId, ...participants.map(p => p.id)])];
            for (const uid of allIds) {
                emitToUser(uid, 'rivalUpdate', r);
                await createNotification(
                    uid,
                    'SCORE_CONFIRMED',
                    '🤝 Maç berabere kaydedildi',
                    '24 saat içinde skor girilmedi. Maç otomatik olarak 0-0 berabere kaydedildi. ELO puanı değişmedi.',
                    { rivalId: r.id, category: r.category.toLowerCase(), subCategory: r.subCategory }
                );
            }
        }

        console.log(`[autoDrawUnscored] Auto-drew ${unscored.length} unscored match(es) as 0-0`);
    } catch (err) {
        console.error('[autoDrawUnscored] Error:', err.message);
    }
}

// Opponent didn't confirm/dispute a submitted score within 1h → auto-confirm it (same ELO path as manual confirm)
export async function autoConfirmPendingScores() {
    try {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000);

        const pending = await prisma.activityRequest.findMany({
            where: { scoreStatus: 'PENDING', completedAt: { lte: cutoff } },
        });

        if (pending.length === 0) return;

        for (const request of pending) {
            const { updated, pointChanges } = await runScoreConfirmation(request);

            const participants = Array.isArray(request.participants) ? request.participants : [];
            const allIds = [...new Set([request.senderId, ...participants.map(p => p.id)])];
            const eloMsg = pointChanges.length > 0 ? ' Puanlar maç sonucuna göre güncellendi.' : '';
            for (const uid of allIds) {
                createNotification(
                    uid, 'SCORE_CONFIRMED',
                    '⏱️ Skor otomatik onaylandı',
                    `Rakip 1 saat içinde skoru onaylamadı, skor otomatik olarak onaylandı.${eloMsg}`,
                    { rivalId: updated.id, pointChanges, category: request.category, subCategory: request.subCategory }
                ).catch(() => {});
            }
        }

        console.log(`[autoConfirmScore] Auto-confirmed ${pending.length} pending score(s)`);
    } catch (err) {
        console.error('[autoConfirmScore] Error:', err.message);
    }
}

// Delete flexible MATCHED matches whose 24h scheduling deadline passed without agreeing on date/time/location
export async function autoDeleteExpiredFlexibleScheduling() {
    try {
        const now = new Date();

        const expired = await prisma.activityRequest.findMany({
            where: {
                status: 'MATCHED',
                flexibleSchedule: true,
                matchDate: null,
                schedulingDeadline: { not: null, lte: now },
            },
            select: { id: true, senderId: true, participants: true, subCategory: true },
        });

        if (expired.length === 0) return;

        await prisma.activityRequest.deleteMany({
            where: { id: { in: expired.map(r => r.id) } },
        });

        for (const m of expired) {
            const parts = Array.isArray(m.participants) ? m.participants : [];
            const allIds = [...new Set([m.senderId, ...parts.map(p => p.id)])];
            for (const uid of allIds) {
                emitToUser(uid, 'rivalDeleted', { rivalId: m.id, subCategory: m.subCategory });
                createNotification(
                    uid, 'MATCH_EXPIRED',
                    '⏰ Esnek Maç Silindi',
                    `${m.subCategory} esnek maçında 24 saat içinde tarih/saat/yer belirlenemediği için ilan otomatik silindi.`,
                    { subCategory: m.subCategory }
                ).catch(() => {});
            }
        }

        console.log(`[flexCleanup] Deleted ${expired.length} expired flexible scheduling match(es)`);
    } catch (err) {
        console.error('[flexCleanup] Error:', err.message);
    }
}

export function startAutoCompleteJob() {
    autoCompleteExpiredMatches();
    autoDrawUnscored();
    autoDeleteExpiredFlexibleScheduling();
    autoConfirmPendingScores();
    setInterval(autoCompleteExpiredMatches, 2 * 60 * 1000);
    setInterval(autoDrawUnscored, 10 * 60 * 1000);
    setInterval(autoDeleteExpiredFlexibleScheduling, 5 * 60 * 1000);
    setInterval(autoConfirmPendingScores, 5 * 60 * 1000);
    console.log('⏰ Auto-complete job started (every 2 min)');
    console.log('⏰ Auto-draw unscored job started (every 10 min)');
    console.log('⏰ Flexible scheduling cleanup job started (every 5 min)');
    console.log('⏰ Auto-confirm pending scores job started (every 5 min, 1h timeout)');
}
