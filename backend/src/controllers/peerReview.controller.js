import prisma from '../config/prisma.js';
import {
    PEER_REVIEW_SUBCATEGORIES, computeMatchSides, isPremadePair,
    computeReviewerTrustScore, tryApplyPeerReviewBlend,
} from '../utils/peerReview.js';

function getRosterIds(request) {
    const participants = Array.isArray(request.participants) ? request.participants : [];
    const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];
    return [...new Set([request.senderId, ...participants.map(p => p.id), ...senderTeamArr.map(m => m.id)])];
}

// GET /rivals/:id/peer-review-targets — maçtaki, kendisi ve zaten oyladıkları hariç
// oyuncuları döner. isPremade istemciye hiç gösterilmez (istismarı kolaylaştırmasın).
export const getPeerReviewTargets = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (!PEER_REVIEW_SUBCATEGORIES.includes(request.subCategory)) {
            return res.status(400).json({ message: 'Peer review not available for this activity' });
        }

        const rosterIds = getRosterIds(request);
        if (!rosterIds.includes(req.userId)) return res.status(403).json({ message: 'Forbidden' });

        const alreadyVoted = await prisma.matchPeerReview.findMany({
            where: { matchId: id, reviewerId: req.userId },
            select: { revieweeId: true },
        });
        const votedIds = new Set(alreadyVoted.map(v => v.revieweeId));

        const targetIds = rosterIds.filter(uid => uid !== req.userId && !votedIds.has(uid));
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

        const rosterIds = getRosterIds(request);
        if (!rosterIds.includes(req.userId) || !rosterIds.includes(revieweeId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const sides = computeMatchSides(request);
        const premade = isPremadePair(sides, req.userId, revieweeId);

        // Oy vermeden ÖNCEKİ trust skoru kullanılır — oyun kendi ağırlığını etkilemesin.
        const trustScore = await computeReviewerTrustScore(req.userId, request.subCategory);

        try {
            await prisma.matchPeerReview.create({
                data: {
                    matchId: id, reviewerId: req.userId, revieweeId,
                    subCategory: request.subCategory,
                    technicalStars, mentalStars,
                    isPremade: premade,
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

        // Roster'daki herkes (revieweeId hariç) oyladıysa hemen harmanla (hızlı yol) —
        // aksi halde 48 saatlik job güvence olarak devreye girer (peerReviewBlend.js).
        const revieweeVoteCount = await prisma.matchPeerReview.count({ where: { matchId: id, revieweeId } });
        const expectedVoters = rosterIds.length - 1;
        if (revieweeVoteCount >= expectedVoters) {
            await tryApplyPeerReviewBlend(id, revieweeId, request.subCategory).catch(() => {});
        }

        res.json({ ok: true });
    } catch (error) { next(error); }
};
