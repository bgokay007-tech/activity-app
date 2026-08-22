import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { applyBlendedVolleyballRating } from '../utils/volleyballRating.js';

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

// POST /rivals/:id/spectators/:spectatorUserId/dispute — kullanıcı isteği: "o seyircinin gelip
// gelmediğini iki takımın yarısından 1 fazla kişi itiraz ederse sahte değerlendirme var diye
// bildirimde bulunsunlar, o değerlendirme yok hükmünde olsun, admine de bildirim gitsin."
// Maç kadrosundaki (iki takım) oyuncular "bu kişi seyirci olarak gelmedi" diye itiraz eder;
// itiraz edenler kadronun yarısından fazlasına ulaşınca (abandonMatch'teki aynı çoğunluk
// formülü — bkz. rival.controller.js) seyirci kaydı silinir ve bu seyirciliğe dayanarak
// verilmiş COACH değerlendirmesi (varsa) geçersiz kılınıp derece puanı yeniden hesaplanır.
export const disputeSpectator = async (req, res, next) => {
    try {
        const { id, spectatorUserId } = req.params;
        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'Bulunamadı' });

        const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const participantsArr = Array.isArray(rival.participants) ? rival.participants : [];
        const rosterIds = [...new Set([
            rival.senderId,
            ...senderTeamArr.filter(p => p?.id).map(p => p.id),
            ...participantsArr.filter(p => p?.id).map(p => p.id),
        ])];
        if (!rosterIds.includes(req.userId)) return res.status(403).json({ message: 'Bu maçın kadrosunda değilsiniz.' });

        const spectator = await prisma.matchSpectator.findUnique({
            where: { activityRequestId_userId: { activityRequestId: id, userId: spectatorUserId } },
        });
        if (!spectator) return res.status(404).json({ message: 'Bu kişi bu maça seyirci olarak kayıtlı değil.' });

        const voterIds = new Set(Array.isArray(spectator.disputeVoterIds) ? spectator.disputeVoterIds : []);
        voterIds.add(req.userId);
        const majorityNeeded = Math.floor(rosterIds.length / 2) + 1;

        if (voterIds.size < majorityNeeded) {
            await prisma.matchSpectator.update({ where: { id: spectator.id }, data: { disputeVoterIds: [...voterIds] } });
            return res.json({ resolved: false, voided: false, voteCount: voterIds.size, majorityNeeded });
        }

        await prisma.matchSpectator.delete({ where: { id: spectator.id } });

        const voidedRatings = await prisma.volleyballRating.findMany({
            where: { raterId: spectatorUserId, subjectId: { in: rosterIds }, raterRole: 'COACH' },
            select: { subjectId: true },
        });
        if (voidedRatings.length > 0) {
            await prisma.volleyballRating.deleteMany({
                where: { raterId: spectatorUserId, subjectId: { in: voidedRatings.map(r => r.subjectId) }, raterRole: 'COACH' },
            });
            for (const { subjectId } of voidedRatings) {
                await applyBlendedVolleyballRating(subjectId).catch(() => {});
            }
        }

        res.json({ resolved: true, voided: voidedRatings.length > 0 });

        const disputedUser = await prisma.user.findUnique({ where: { id: spectatorUserId }, select: { username: true, fullName: true } });
        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        for (const admin of admins) {
            createNotification(admin.id, 'FAKE_SPECTATOR_REPORTED', '🚩 Sahte Seyirci Bildirimi',
                `"${disputedUser?.fullName || disputedUser?.username}" bir voleybol maçında seyirci olarak katıldığını iddia etti ama maç kadrosunun çoğunluğu (${voterIds.size}/${rosterIds.length}) bunu reddetti. Seyirci kaydı silindi${voidedRatings.length > 0 ? ' ve verdiği antrenör değerlendirmesi geçersiz kılındı.' : '.'}`,
                { rivalId: id, disputedUserId: spectatorUserId }
            ).catch(() => {});
        }
    } catch (error) { next(error); }
};
