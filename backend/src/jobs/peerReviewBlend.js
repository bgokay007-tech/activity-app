import prisma from '../config/prisma.js';
import { PEER_REVIEW_SUBCATEGORIES, tryApplyPeerReviewBlend } from '../utils/peerReview.js';

const TIMEOUT_MS = 48 * 60 * 60 * 1000;
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // sorguyu sınırlamak için, sonsuza kadar eski maçları taramaz

// 48 saat içinde roster'daki herkes akran oyu vermezse, eldeki oylarla (varsa) harmanı
// zorla uygular — hiç kimse sonsuza kadar bekletilmez. tryApplyPeerReviewBlend zaten
// idempotent olduğu için (PeerReviewBlend @@unique([matchId, userId])) tekrar
// çalıştırmak güvenlidir; hiç oyu olmayan kullanıcılar için null döner, tekrar denenir.
export async function applyOverduePeerReviewBlends() {
    try {
        const now = Date.now();
        const cutoff = new Date(now - TIMEOUT_MS);
        const lookback = new Date(now - LOOKBACK_MS);

        const matches = await prisma.activityRequest.findMany({
            where: {
                subCategory: { in: PEER_REVIEW_SUBCATEGORIES },
                matchMode: 'COMPETITIVE',
                scoreStatus: 'CONFIRMED',
                completedAt: { lte: cutoff, gte: lookback },
            },
            select: { id: true, subCategory: true, senderId: true, participants: true, senderTeam: true },
        });

        let applied = 0;
        for (const m of matches) {
            const participants = Array.isArray(m.participants) ? m.participants : [];
            const senderTeamArr = Array.isArray(m.senderTeam) ? m.senderTeam : [];
            const rosterIds = [...new Set([m.senderId, ...participants.map(p => p.id), ...senderTeamArr.map(t => t.id)])];

            for (const uid of rosterIds) {
                const result = await tryApplyPeerReviewBlend(m.id, uid, m.subCategory);
                if (result) applied++;
            }
        }

        if (applied > 0) console.log(`[peerReviewBlend] Force-applied ${applied} overdue peer review blend(s)`);
    } catch (err) {
        console.error('[peerReviewBlend] Error:', err.message);
    }
}

export function startPeerReviewBlendJob() {
    applyOverduePeerReviewBlends();
    setInterval(applyOverduePeerReviewBlends, 15 * 60 * 1000);
    console.log('⏰ Peer review blend job started (every 15 min, 48h timeout)');
}
