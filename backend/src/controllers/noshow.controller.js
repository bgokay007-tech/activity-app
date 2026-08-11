import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';

export const reportNoShow = async (req, res, next) => {
    try {
        const { id: rivalId } = req.params;
        const { absentUserIds = [], courtPhotoUrl } = req.body;

        const match = await prisma.activityRequest.findUnique({ where: { id: rivalId } });
        if (!match) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (match.status !== 'MATCHED') return res.status(400).json({ message: 'Bu maç aktif değil' });

        // Reporter must be a participant
        const participants = Array.isArray(match.participants) ? match.participants : [];
        const senderTeam  = Array.isArray(match.senderTeam)   ? match.senderTeam   : [];
        const allIds = [match.senderId, ...participants.map(p => p.id), ...senderTeam.map(p => p.id)];
        if (!allIds.includes(req.userId)) {
            return res.status(403).json({ message: 'Bu maçın katılımcısı değilsiniz' });
        }

        // Must not report self
        if (absentUserIds.includes(req.userId)) {
            return res.status(400).json({ message: 'Kendinizi bildiramazsınız' });
        }

        // Match must have started (matchTime is Turkey local UTC+3 → convert to UTC)
        if (match.matchDate && match.matchTime) {
            const [h, m] = match.matchTime.split(':').map(Number);
            const startUTC = new Date(new Date(match.matchDate).getTime() + (h * 60 + m) * 60000 - 3 * 3600000);
            if (new Date() < startUTC) {
                return res.status(400).json({ message: 'Maç henüz başlamadı' });
            }
        }

        // No duplicate pending report
        const existing = await prisma.noShowReport.findFirst({
            where: { rivalId, reporterId: req.userId, status: 'PENDING' },
        });
        if (existing) return res.status(400).json({ message: 'Bu maç için zaten bir bildirim gönderdınız' });

        const report = await prisma.noShowReport.create({
            data: {
                rivalId,
                reporterId: req.userId,
                absentUserIds,
                courtPhotoUrl: courtPhotoUrl || null,
                subCategory: match.subCategory,
                category: match.category,
            },
        });

        // Notify admins
        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        for (const admin of admins) {
            await createNotification(
                admin.id,
                'NO_SHOW_REPORT',
                '🚫 Gelmeme Bildirimi',
                `${match.subCategory} maçı için gelmeme bildirimi alındı.`,
                { rivalId, reportId: report.id },
            );
        }

        res.json({ message: 'Bildirim gönderildi', report });
    } catch (error) { next(error); }
};

export const getNoShowReports = async (req, res, next) => {
    try {
        const reports = await prisma.noShowReport.findMany({
            where: { status: 'PENDING' },
            include: {
                rival: {
                    select: {
                        id: true, subCategory: true, category: true,
                        matchDate: true, matchTime: true,
                        senderId: true, courtName: true,
                    },
                },
                reporter: { select: { id: true, username: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Enrich: fetch usernames for absentUserIds
        const allAbsentIds = [...new Set(reports.flatMap(r => Array.isArray(r.absentUserIds) ? r.absentUserIds : []))];
        const absentUsers = allAbsentIds.length
            ? await prisma.user.findMany({ where: { id: { in: allAbsentIds } }, select: { id: true, username: true } })
            : [];
        const userMap = Object.fromEntries(absentUsers.map(u => [u.id, u.username]));

        res.json(reports.map(r => ({
            ...r,
            absentUsers: (Array.isArray(r.absentUserIds) ? r.absentUserIds : []).map(uid => ({
                id: uid, username: userMap[uid] || uid,
            })),
        })));
    } catch (error) { next(error); }
};

// Dal bazında gelmeme cezası miktarı — kullanıcı isteği: voleybolda 0.40 yerine 0.20
// kesiliyor. Listede olmayan dallar için varsayılan (DEFAULT) kullanılır.
const NO_SHOW_PENALTY_BY_SUBCATEGORY = { volleyball: 0.20 };
const DEFAULT_NO_SHOW_PENALTY = 0.40;

export const approveNoShow = async (req, res, next) => {
    try {
        const { id } = req.params;
        const report = await prisma.noShowReport.findUnique({ where: { id } });
        if (!report) return res.status(404).json({ message: 'Rapor bulunamadı' });
        if (report.status !== 'PENDING') return res.status(400).json({ message: 'Zaten işleme alındı' });

        const penalty = NO_SHOW_PENALTY_BY_SUBCATEGORY[report.subCategory] ?? DEFAULT_NO_SHOW_PENALTY;
        const absentIds = Array.isArray(report.absentUserIds) ? report.absentUserIds : [];
        for (const userId of absentIds) {
            // Clamp skillRating to minimum 0
            const interest = await prisma.userInterest.findFirst({
                where: { userId, subCategory: report.subCategory },
                select: { id: true, skillRating: true },
            });
            if (interest) {
                const newRating = Math.max(0, Number(interest.skillRating) - penalty);
                await prisma.userInterest.update({
                    where: { id: interest.id },
                    data: { skillRating: newRating },
                });
            }
            await createNotification(
                userId,
                'NO_SHOW_PENALTY',
                '⚠️ Gelmeme Cezası',
                `${report.subCategory} maçına gelmediğiniz için ${penalty.toFixed(2)} puan kesildi.`,
                { rivalId: report.rivalId },
            );
        }

        await prisma.noShowReport.update({ where: { id }, data: { status: 'APPROVED' } });
        res.json({ message: 'Onaylandı, cezalar uygulandı' });
    } catch (error) { next(error); }
};

export const rejectNoShow = async (req, res, next) => {
    try {
        const { id } = req.params;
        const report = await prisma.noShowReport.findUnique({ where: { id } });
        if (!report) return res.status(404).json({ message: 'Rapor bulunamadı' });
        if (report.status !== 'PENDING') return res.status(400).json({ message: 'Zaten işleme alındı' });

        await prisma.noShowReport.update({ where: { id }, data: { status: 'REJECTED' } });
        res.json({ message: 'Reddedildi' });
    } catch (error) { next(error); }
};
