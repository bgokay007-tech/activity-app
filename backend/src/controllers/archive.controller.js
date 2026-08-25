import prisma from '../config/prisma.js';
import { PEER_REVIEW_SUBCATEGORIES, computeMatchSides } from '../utils/peerReview.js';

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
            // Kullanıcı isteği: akran değerlendirmesi sadece takım arkadaşlarına yapılabildiği
            // için (bkz. peerReview.controller.js) "değerlendirilmedi" hedefleri de SADECE
            // kendi takımımla sınırlı olmalı — önceden rakip takım da hedeflere dahil edilip
            // butonun gereksiz yere "değerlendirilecek biri var" göstermesine yol açıyordu.
            const { teamA, teamB } = computeMatchSides(r);
            const mySide = teamA.has(myId) ? teamA : teamB.has(myId) ? teamB : null;
            if (!mySide) return r;
            const targets = [...mySide].filter(uid => uid !== myId);
            const voted = myVotesByMatch[r.id] || new Set();
            const needsPeerReview = targets.some(uid => !voted.has(uid));
            return { ...r, needsPeerReview };
        });

        // Hakem değerlendirmesi: maçın onaylanmış hakemi varsa (refereeId) ve maç tamamlandıysa,
        // katılımcı olan ben (hakemin kendisi değilsem) o maçın hakemliğini yorum+yıldızla
        // değerlendirebilirim — bkz. POST /rivals/:id/referee-review. Zaten değerlendirdiysem
        // kendi değerlendirmem kart üzerinde gösterilsin diye ekleniyor.
        const refereedRivalIds = rivalsAnnotated.filter(r => r.refereeId && r.status === 'COMPLETED').map(r => r.id);
        const myRefereeReviews = refereedRivalIds.length ? await prisma.refereeReview.findMany({
            where: { rivalId: { in: refereedRivalIds }, reviewerId: myId },
        }) : [];
        const myReviewByRival = Object.fromEntries(myRefereeReviews.map(rv => [rv.rivalId, rv]));
        const rivalsFinal = rivalsAnnotated.map(r => {
            if (!r.refereeId || r.status !== 'COMPLETED') return r;
            const parts = Array.isArray(r.participants) ? r.participants : [];
            const senderTeamArr = Array.isArray(r.senderTeam) ? r.senderTeam : [];
            const rosterIds = [...new Set([r.senderId, ...parts.map(p => p.id), ...senderTeamArr.map(m => m.id)])];
            const canReviewReferee = r.refereeId !== myId && rosterIds.includes(myId);
            return { ...r, canReviewReferee, myRefereeReview: myReviewByRival[r.id] || null };
        });

        // ── Hakemlik yaptığım (tamamlanmış) maçlar — Arşiv > Hakemlik sekmesi ──────────
        // Kullanıcı isteği: bu sekmede her maçın anket cevapları/yorumları ve o maça özel
        // yıldız ortalaması görülebilsin, ayrıca admin onaylı hakemlere (RefereeListing.approved)
        // tüm hakemlik geçmişinin genel ortalaması gösterilsin.
        const refereedMatchesRaw = await prisma.activityRequest.findMany({
            where: {
                refereeId: myId,
                status: 'COMPLETED',
                ...(category    && { category }),
                ...(subCategory && { subCategory }),
                ...(hasDate && { completedAt: dateFilter }),
            },
            include: {
                sender: { select: USER_SELECT },
                refereeReviews: {
                    include: { reviewer: { select: USER_SELECT } },
                    orderBy: { createdAt: 'desc' },
                },
            },
            orderBy: { completedAt: 'desc' },
            take: 100,
        });
        const refereedMatches = refereedMatchesRaw.map(m => {
            const reviews = m.refereeReviews || [];
            const sum = reviews.reduce((s, r) => s + r.rating, 0);
            return { ...m, avgRating: reviews.length ? sum / reviews.length : null, reviewCount: reviews.length };
        });

        // Genel hakemlik ortalaması/onay durumu — arşiv filtrelerinden (tarih/şehir)
        // ETKİLENMEZ, her zaman TÜM hakemlik geçmişini yansıtır.
        let refereeApproved = false, refereeOverallAvgRating = null, refereeTotalReviews = 0;
        if (subCategory) {
            const listing = await prisma.refereeListing.findFirst({
                where: { userId: myId, subCategory, approved: true },
                select: { id: true },
            });
            refereeApproved = !!listing;
            const agg = await prisma.refereeReview.aggregate({
                where: { refereeUserId: myId, rival: { subCategory } },
                _avg: { rating: true },
                _count: { id: true },
            });
            refereeOverallAvgRating = agg._avg.rating;
            refereeTotalReviews = agg._count.id;
        }

        res.json({
            tournaments, rivals: rivalsFinal, refereedMatches,
            refereeApproved, refereeOverallAvgRating, refereeTotalReviews,
        });
    } catch (e) { next(e); }
};
