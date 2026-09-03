import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { subCategoryTR } from '../utils/subCategoryLabels.js';
import { turkeyDateTimeToUtc } from '../utils/tzTime.js';

// Ceza penceresi başlamadan (maça X saat kala) 1 saat önce, kadrodaki herkese (ilan sahibi
// dahil) tek seferlik bir uyarı gönderir — "hâlâ cezasız iptal hakkın var ama 1 saat sonra
// bitiyor". Ceza hesaplaması cancelMatch/removeRivalParticipant ile AYNI (bkz.
// rival.controller.js — tenis/padel sabit 5 saat, voleybolde ilan sahibinin belirlediği
// cancelPenaltyHours; belirlemediyse voleybolde hiç ceza yok, bu job da o ilanı atlar).
const PENALIZED_SUBS = ['tennis', 'padel', 'volleyball'];

function getMatchStart(rival) {
    if (!rival.matchDate || !rival.matchTime) return null;
    // cancelMatch/removeRivalParticipant'taki gerçek ceza hesabıyla (turkeyDateTimeToUtc)
    // birebir aynı saat yorumu kullanılmazsa, bu uyarı gerçek ceza anına göre yanlış bir
    // saatte tetiklenebilir.
    return turkeyDateTimeToUtc(rival.matchDate, rival.matchTime);
}

async function checkAndNotifyCancelPenaltyWarnings() {
    try {
        const now = new Date();
        const matches = await prisma.activityRequest.findMany({
            where: {
                status: 'MATCHED',
                subCategory: { in: PENALIZED_SUBS },
                matchDate: { not: null },
            },
            select: {
                id: true, senderId: true, category: true, subCategory: true, matchDate: true, matchTime: true,
                cancelPenaltyHours: true, participants: true, senderTeam: true, unassignedPlayers: true,
            },
        });
        if (matches.length === 0) return;

        const eligible = [];
        for (const rival of matches) {
            const matchStart = getMatchStart(rival);
            if (!matchStart) continue;
            const penaltyWindowHours = rival.subCategory === 'volleyball' ? rival.cancelPenaltyHours : 5;
            if (penaltyWindowHours == null) continue; // voleybolde sahibi ceza belirlemediyse hiç ceza yok
            const penaltyStart = new Date(matchStart.getTime() - penaltyWindowHours * 3600000);
            const warnAt = new Date(penaltyStart.getTime() - 3600000);
            // Sadece uyarı anı geçmiş AMA ceza penceresi henüz başlamamışken bildirim anlamlı —
            // ceza zaten başladıysa "1 saat içinde cezasız iptal hakkın var" artık yanlış olurdu.
            if (now >= warnAt && now < penaltyStart) {
                eligible.push({ rival, penaltyWindowHours });
            }
        }
        if (eligible.length === 0) return;

        const since = new Date(now.getTime() - 24 * 3600000);
        const sentNotifs = await prisma.notification.findMany({
            where: { type: 'CANCEL_PENALTY_WARNING', createdAt: { gte: since } },
            select: { userId: true, data: true },
        });
        const sentKeys = new Set(sentNotifs.map(n => `${n.data?.rivalId}|${n.userId}`));

        let sentCount = 0;
        for (const { rival, penaltyWindowHours } of eligible) {
            const involvedIds = [...new Set([
                rival.senderId,
                ...(Array.isArray(rival.senderTeam) ? rival.senderTeam : []).filter(p => p?.id).map(p => p.id),
                ...(Array.isArray(rival.participants) ? rival.participants : []).filter(p => p?.id).map(p => p.id),
                ...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []).filter(p => p?.id).map(p => p.id),
            ])];
            const windowLabel = Number.isInteger(penaltyWindowHours) ? `${penaltyWindowHours}` : penaltyWindowHours.toFixed(1);
            for (const uid of involvedIds) {
                const key = `${rival.id}|${uid}`;
                if (sentKeys.has(key)) continue;
                sentKeys.add(key);
                sentCount++;
                createNotification(
                    uid, 'CANCEL_PENALTY_WARNING',
                    '⏰ Cezasız İptal Süreniz Doluyor',
                    `"${subCategoryTR(rival.subCategory)}" maçında iptal cezası, maç saatine ${windowLabel} saat kala başlıyor. 1 saat içinde cezasız iptal etme hakkınız var — bu süreden sonra iptal ederseniz, ilanı oluşturanın onayı olmadan cezalı ayrılmak zorunda kalırsınız.`,
                    { rivalId: rival.id, category: rival.category, subCategory: rival.subCategory }
                ).catch(() => {});
            }
        }
        if (sentCount > 0) console.log(`[cancelPenaltyWarning] Sent ${sentCount} cancel-penalty warning notification(s)`);
    } catch (err) {
        console.error('[cancelPenaltyWarning] error:', err.message);
    }
}

export function startCancelPenaltyWarningJob() {
    checkAndNotifyCancelPenaltyWarnings();
    setInterval(checkAndNotifyCancelPenaltyWarnings, 15 * 60 * 1000); // her 15 dakikada bir
    console.log('⏰ Cancel penalty warning job started (every 15 min)');
}
