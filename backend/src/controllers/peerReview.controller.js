import prisma from '../config/prisma.js';
import {
    PEER_REVIEW_SUBCATEGORIES, computeMatchSides,
    computeReviewerTrustScore, tryApplyPeerReviewBlend,
} from '../utils/peerReview.js';

// Kullanıcı isteği: akran değerlendirmesi SADECE aynı takımdaki oyunculara yapılır —
// rakip takımı oyuncu maç boyunca yakından gözlemlemez, kendi takım arkadaşının
// manşet/pas/uyumunu gözlemler. Önceden getRosterIds (HER İKİ takım) döndürülüyordu,
// bu da rakipleri de değerlendirme hedefi olarak sunuyordu — tasarımla çelişiyordu.
function getSameSideRosterIds(request, userId) {
    const { teamA, teamB } = computeMatchSides(request);
    const mySide = teamA.has(userId) ? teamA : teamB.has(userId) ? teamB : null;
    return mySide ? [...mySide] : [];
}

// GET /rivals/:id/peer-review-targets — maçtaki, kendi takımından, kendisi ve zaten
// oyladıkları hariç oyuncuları döner.
export const getPeerReviewTargets = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (!PEER_REVIEW_SUBCATEGORIES.includes(request.subCategory)) {
            return res.status(400).json({ message: 'Peer review not available for this activity' });
        }

        const sameSideIds = getSameSideRosterIds(request, req.userId);
        if (sameSideIds.length === 0) return res.status(403).json({ message: 'Forbidden' });

        const alreadyVoted = await prisma.matchPeerReview.findMany({
            where: { matchId: id, reviewerId: req.userId },
            select: { revieweeId: true },
        });
        const votedIds = new Set(alreadyVoted.map(v => v.revieweeId));

        const targetIds = sameSideIds.filter(uid => uid !== req.userId && !votedIds.has(uid));
        if (targetIds.length === 0) return res.json({ targets: [], subCategory: request.subCategory });

        const users = await prisma.user.findMany({
            where: { id: { in: targetIds } },
            select: { id: true, username: true, fullName: true, avatar: true },
        });

        res.json({ targets: users, subCategory: request.subCategory });
    } catch (error) { next(error); }
};

// POST /rivals/:id/peer-review { revieweeId, technicalStars, mentalStars }
export const submitPeerReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { revieweeId, technicalStars, mentalStars } = req.body;

        if (!Number.isInteger(technicalStars) || technicalStars < 1 || technicalStars > 5 ||
            !Number.isInteger(mentalStars) || mentalStars < 1 || mentalStars > 5) {
            return res.status(400).json({ message: 'Stars must be integers 1-5' });
        }
        if (revieweeId === req.userId) return res.status(400).json({ message: 'Cannot review yourself' });

        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (!PEER_REVIEW_SUBCATEGORIES.includes(request.subCategory)) {
            return res.status(400).json({ message: 'Peer review not available for this activity' });
        }

        // Kullanıcı isteği: akran değerlendirmesi SADECE aynı takım arkadaşına yapılabilir —
        // rakip takımdan biri hedef olarak gönderilirse reddedilir (frontend zaten sadece
        // takım arkadaşlarını hedef olarak sunuyor, bu sunucu tarafı ikinci bir güvence).
        const mySideIds = getSameSideRosterIds(request, req.userId);
        if (mySideIds.length === 0 || !mySideIds.includes(revieweeId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Oy vermeden ÖNCEKİ trust skoru kullanılır — oyun kendi ağırlığını etkilemesin.
        const trustScore = await computeReviewerTrustScore(req.userId, request.subCategory);

        try {
            await prisma.matchPeerReview.create({
                data: {
                    matchId: id, reviewerId: req.userId, revieweeId,
                    subCategory: request.subCategory,
                    technicalStars, mentalStars,
                    // Kullanıcı isteği: akran değerlendirmesi artık SADECE takım arkadaşları
                    // arasında yapılıyor — bu isPremadePair'ın "aynı taraf -> harmanlamaya
                    // girmez" varsayımıyla ÇELİŞİYORDU (her oy otomatik isPremade:true olup
                    // hiçbiri elo'ya hiç yansımıyordu). Takım arkadaşı değerlendirmesi artık
                    // sistemin ASIL veri kaynağı, "şüpheli" değil — isPremade her zaman false
                    // yazılıyor, istismar koruması bunun yerine trustWeightApplied (hep aynı
                    // puanı veren oy vericilerin ağırlığını düşüren varyans skoru) ile sağlanıyor.
                    isPremade: false,
                    trustWeightApplied: trustScore,
                },
            });
        } catch (e) {
            if (e.code === 'P2002') return res.status(400).json({ message: 'Already reviewed this player for this match' });
            throw e;
        }

        await prisma.userInterest.updateMany({
            where: { userId: req.userId, subCategory: request.subCategory },
            data: { trustScore },
        });

        // Takım arkadaşlarının hepsi (revieweeId hariç) oyladıysa hemen harmanla (hızlı yol) —
        // aksi halde 48 saatlik job güvence olarak devreye girer (peerReviewBlend.js).
        const revieweeVoteCount = await prisma.matchPeerReview.count({ where: { matchId: id, revieweeId } });
        const revieweeSideIds = getSameSideRosterIds(request, revieweeId);
        const expectedVoters = revieweeSideIds.length - 1;
        if (expectedVoters > 0 && revieweeVoteCount >= expectedVoters) {
            await tryApplyPeerReviewBlend(id, revieweeId, request.subCategory).catch(() => {});
        }

        res.json({ ok: true });
    } catch (error) { next(error); }
};
