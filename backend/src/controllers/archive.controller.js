import prisma from '../config/prisma.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

export const getArchive = async (req, res, next) => {
    try {
        const { category, subCategory, city, court, dateFrom, dateTo } = req.query;
        const myId = req.userId;

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

        const rivals = allRivals.filter(r => {
            if (r.senderId === myId || r.receiverId === myId) return true;
            const parts = Array.isArray(r.participants) ? r.participants : [];
            return parts.some(p => p.id === myId);
        });

        res.json({ tournaments, rivals });
    } catch (e) { next(e); }
};
