import prisma from '../config/prisma.js';

const SPECTATOR_SELECT = { id: true, username: true, fullName: true, avatar: true };

// Seyirci olarak katılım şimdilik sadece voleybolda açık — amaç onaylı antrenörlerin
// izledikleri maçlardaki oyuncuları değerlendirebilmesi (bkz. resolveRaterRole,
// backend/src/utils/volleyballRating.js). Başka dala genişletilirse burası güncellenir.
const SPECTATOR_SUBCATEGORIES = ['volleyball'];

// GET /rivals/:id/spectators
export const getSpectators = async (req, res, next) => {
    try {
        const { id } = req.params;
        const rival = await prisma.activityRequest.findUnique({ where: { id }, select: { id: true, subCategory: true } });
        if (!rival) return res.status(404).json({ message: 'Bulunamadı' });
        if (!SPECTATOR_SUBCATEGORIES.includes(rival.subCategory)) {
            return res.json({ spectators: [], amISpectator: false, canJoin: false });
        }

        const rows = await prisma.matchSpectator.findMany({
            where: { activityRequestId: id },
            orderBy: { createdAt: 'asc' },
            include: { user: { select: SPECTATOR_SELECT } },
        });

        res.json({
            spectators: rows.map(r => ({ id: r.id, user: r.user, createdAt: r.createdAt })),
            amISpectator: rows.some(r => r.userId === req.userId),
            canJoin: true,
        });
    } catch (error) { next(error); }
};

// POST /rivals/:id/spectators
export const joinSpectator = async (req, res, next) => {
    try {
        const { id } = req.params;
        const rival = await prisma.activityRequest.findUnique({ where: { id }, select: { id: true, subCategory: true, status: true } });
        if (!rival) return res.status(404).json({ message: 'Bulunamadı' });
        if (!SPECTATOR_SUBCATEGORIES.includes(rival.subCategory)) {
            return res.status(400).json({ message: 'Bu dalda seyirci olarak katılım açık değil.' });
        }
        // Maç henüz oynanmadan önce (açık ilan) veya programlandıktan sonra (yaklaşan maç)
        // seyirci olarak katılınabilir — biten/iptal edilen bir maça sonradan "seyirci" olunamaz.
        if (rival.status !== 'OPEN' && rival.status !== 'MATCHED') {
            return res.status(400).json({ message: 'Bu maça artık seyirci olarak katılamazsınız.' });
        }

        try {
            await prisma.matchSpectator.create({ data: { activityRequestId: id, userId: req.userId } });
        } catch (e) {
            if (e.code !== 'P2002') throw e; // zaten seyirci — idempotent, hata verme
        }

        const rows = await prisma.matchSpectator.findMany({
            where: { activityRequestId: id },
            orderBy: { createdAt: 'asc' },
            include: { user: { select: SPECTATOR_SELECT } },
        });
        res.json({
            spectators: rows.map(r => ({ id: r.id, user: r.user, createdAt: r.createdAt })),
            amISpectator: true,
            canJoin: true,
        });
    } catch (error) { next(error); }
};

// DELETE /rivals/:id/spectators
export const leaveSpectator = async (req, res, next) => {
    try {
        const { id } = req.params;
        await prisma.matchSpectator.deleteMany({ where: { activityRequestId: id, userId: req.userId } });

        const rows = await prisma.matchSpectator.findMany({
            where: { activityRequestId: id },
            orderBy: { createdAt: 'asc' },
            include: { user: { select: SPECTATOR_SELECT } },
        });
        res.json({
            spectators: rows.map(r => ({ id: r.id, user: r.user, createdAt: r.createdAt })),
            amISpectator: false,
            canJoin: true,
        });
    } catch (error) { next(error); }
};
