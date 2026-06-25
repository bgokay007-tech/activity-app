import prisma from '../config/prisma.js';

const FLAG_THRESHOLD = 3;

export const reportListing = async (req, res, next) => {
    try {
        const { type, id } = req.params;
        const { reason } = req.body;
        const reporterId = req.userId;

        if (!reason?.trim()) return res.status(400).json({ message: 'Sebep gerekli' });
        if (type !== 'equipment' && type !== 'coach') return res.status(400).json({ message: 'Geçersiz ilan tipi' });

        const listingType = type === 'equipment' ? 'EQUIPMENT' : 'COACH';

        const listing = type === 'equipment'
            ? await prisma.equipmentListing.findUnique({ where: { id } })
            : await prisma.coachListing.findUnique({ where: { id } });

        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (listing.userId === reporterId) return res.status(400).json({ message: 'Kendi ilanınızı bildiremezsiniz' });
        if (listing.status !== 'ACTIVE') return res.status(400).json({ message: 'Bu ilan zaten inceleme altında' });

        await prisma.listingReport.create({
            data: { reporterId, listingType, listingId: id, reason: reason.trim() },
        });

        const count = await prisma.listingReport.count({ where: { listingType, listingId: id } });

        const updateData = { reportCount: count, ...(count >= FLAG_THRESHOLD && { status: 'FLAGGED' }) };

        if (type === 'equipment') {
            await prisma.equipmentListing.update({ where: { id }, data: updateData });
        } else {
            await prisma.coachListing.update({ where: { id }, data: updateData });
        }

        res.json({ ok: true });
    } catch (e) {
        if (e.code === 'P2002') return res.status(409).json({ message: 'Bu ilanı zaten bildirdiniz' });
        next(e);
    }
};
