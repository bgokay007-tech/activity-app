import prisma from '../config/prisma.js';
import { PEER_REVIEW_SUBCATEGORIES } from '../utils/peerReview.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

export const getArchive = async (req, res, next) => {
    try {
        const { category, subCategory, city, court, dateFrom, dateTo, scope } = req.query;
        const myId = req.userId;
        const allUsers = scope === 'all';

        const dateFilter = {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo   && { lte: new Date(dateTo) }),
        };
        const hasDate = Object.keys(dateFilter).length > 0;

        // ── Archived tournaments ─────────────────────────────────────
        const tWhere = {
            status: 'COMPLETED',
            ...(category    && { category }),
            ...(subCategory && { subCategory }),
            ...(city && { OR: [
                { city:     { contains: city, mode: 'insensitive' } },
                { location: { contains: city, mode: 'insensitive' } },
            ]}),
            ...(hasDate && { completedAt: dateFilter }),
        };

        const allTournaments = await prisma.tournament.findMany({
            where: tWhere,
            include: {
                creator:      { select: USER_SELECT },
                participants: { where: { userId: myId }, select: { userId: true } },
            },
            orderBy: { completedAt: 'desc' },
            take: 100,
        });

        const tournaments = allTournaments.filter(t =>
            t.creatorId === myId || t.participants.length > 0
        );

        // ── Archived rivals ──────────────────────────────────────────
        const rWhere = {
            status: 'COMPLETED',
            archived: true,
            scoreStatus: 'CONFIRMED',
            ...(category    && { category }),
            ...(subCategory && { subCategory }),
            ...(city  && { location: { contains: city, mode: 'insensitive' } }),
            ...(court && { courtName: { contains: court, mode: 'insensitive' } }),
            ...(hasDate && { completedAt: dateFilter }),
        };

        const allRivals = await prisma.activityRequest.findMany({
            where: rWhere,
            include: { sender: { select: USER_SELECT } },
            orderBy: { completedAt: 'desc' },
            take: 100,
        });

        const rivals = allUsers ? allRivals : allRivals.filter(r => {
            if (r.senderId === myId || r.receiverId === myId) return true;
            const parts = Array.isArray(r.participants) ? r.participants : [];
            return parts.some(p => p.id === myId);
        });

        // Akran doğrulama: rekabetçi voleybol maçlarında kullanıcı roster'daki herkesi
        // henüz oylamadıysa needsPeerReview=true ("Oyuncuları Değerlendir" butonu için).
        const peerReviewCandidates = rivals.filter(r =>
            PEER_REVIEW_SUBCATEGORIES.includes(r.subCategory) && r.matchMode === 'COMPETITIVE'
        );
        const myVotesByMatch = {};
        if (peerReviewCandidates.length > 0) {
            const votes = await prisma.matchPeerReview.findMany({
                where: { matchId: { in: peerReviewCandidates.map(r => r.id) }, reviewerId: myId },
                select: { matchId: true, revieweeId: true },
            });
            for (const v of votes) {
                if (!myVotesByMatch[v.matchId]) myVotesByMatch[v.matchId] = new Set();
                myVotesByMatch[v.matchId].add(v.revieweeId);
            }
        }
        const rivalsAnnotated = rivals.map(r => {
            if (!PEER_REVIEW_SUBCATEGORIES.includes(r.subCategory) || r.matchMode !== 'COMPETITIVE') return r;
            const participants = Array.isArray(r.participants) ? r.participants : [];
            const senderTeamArr = Array.isArray(r.senderTeam) ? r.senderTeam : [];
            const rosterIds = [...new Set([r.senderId, ...participants.map(p => p.id), ...senderTeamArr.map(m => m.id)])];
            if (!rosterIds.includes(myId)) return r;
            const targets = rosterIds.filter(uid => uid !== myId);
            const voted = myVotesByMatch[r.id] || new Set();
            const needsPeerReview = targets.some(uid => !voted.has(uid));
            return { ...r, needsPeerReview };
        });

        res.json({ tournaments, rivals: rivalsAnnotated });
    } catch (e) { next(e); }
};
