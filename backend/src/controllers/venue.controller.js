import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const overlaps = (as, ae, bs, be) => as < be && ae > bs;

function computeSlots(venue, reservations, date) {
    const open  = toMins(venue.openTime);
    const close = toMins(venue.closeTime);
    const taken = reservations
        .filter(r => r.date === date && r.status !== 'CANCELLED')
        .map(r => ({ s: toMins(r.startTime), e: toMins(r.endTime) }))
        .sort((a, b) => a.s - b.s);

    const isFree = (s, e) => !taken.some(r => overlaps(s, e, r.s, r.e));

    if (venue.slotType === 'FULL_HOUR') {
        const slots = [];
        for (let t = open; t + 60 <= close; t += 60) {
            slots.push({ start: toTime(t), end: toTime(t + 60), free: isFree(t, t + 60) });
        }
        return { type: 'FULL_HOUR', slots };
    }

    if (venue.slotType === 'HALF_HOUR') {
        const slots = [];
        for (let t = open; t + 30 <= close; t += 30) {
            slots.push({ start: toTime(t), end: toTime(t + 30), free: isFree(t, t + 30) });
        }
        return { type: 'HALF_HOUR', slots };
    }

    // FLEXIBLE — serbest pencereler
    const windows = [];
    let prev = open;
    for (const r of taken) {
        if (r.s > prev) windows.push({ start: toTime(prev), end: toTime(r.s), durationMins: r.s - prev });
        prev = Math.max(prev, r.e);
    }
    if (prev < close) windows.push({ start: toTime(prev), end: toTime(close), durationMins: close - prev });

    return {
        type: 'FLEXIBLE',
        windows: windows.filter(w => w.durationMins >= 60),
        taken: taken.map(r => ({ start: toTime(r.s), end: toTime(r.e) })),
    };
}

// ─── İşletme sahibi ───────────────────────────────────────────────────────────

export const createVenue = async (req, res, next) => {
    try {
        const { name, branch, city, district, address, phone, openTime, closeTime, openDays, slotType, courts } = req.body;

        const now = new Date();
        const sub = await prisma.businessSubscription.findFirst({
            where: { userId: req.userId, status: 'ACTIVE', endDate: { gt: now } },
        });
        if (!sub) return res.status(403).json({ message: 'Tesis eklemek için aktif abonelik gerekli' });

        if (!name || !branch || !city) return res.status(400).json({ message: 'İsim, spor dalı ve şehir zorunludur' });
        if (!courts?.length) return res.status(400).json({ message: 'En az bir kort/saha girmelisiniz' });

        const venue = await prisma.businessVenue.create({
            data: {
                userId: req.userId, name, branch, city,
                district: district || null,
                address: address || null,
                phone: phone || null,
                openTime: openTime || '08:00',
                closeTime: closeTime || '22:00',
                openDays: openDays ?? [1, 2, 3, 4, 5, 6, 7],
                slotType: slotType || 'FULL_HOUR',
                courts: { create: courts.map(c => ({ name: c })) },
            },
            include: { courts: true },
        });

        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, businessName: true } });
        await Promise.all(admins.map(a =>
            createNotification(a.id, 'VENUE_REQUEST', '🏟️ Yeni Tesis Başvurusu',
                `${user?.businessName || user?.username} tarafından "${name}" tesisi eklendi. Onay bekliyor.`,
                { venueId: venue.id }
            ).then(() => emitToUser(a.id, 'notification', {})).catch(() => {})
        ));

        res.status(201).json({ venue });
    } catch (error) { next(error); }
};

export const getMyVenues = async (req, res, next) => {
    try {
        const venues = await prisma.businessVenue.findMany({
            where: { userId: req.userId },
            include: { courts: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(venues);
    } catch (error) { next(error); }
};

export const deleteVenue = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(404).json({ message: 'Bulunamadı' });
        await prisma.businessVenue.delete({ where: { id } });
        res.json({ message: 'Silindi' });
    } catch (error) { next(error); }
};

export const updateIban = async (req, res, next) => {
    try {
        const { businessIban } = req.body;
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        if (!user?.isBusiness) return res.status(403).json({ message: 'Yalnızca işletme hesapları' });
        const updated = await prisma.user.update({ where: { id: req.userId }, data: { businessIban } });
        res.json({ businessIban: updated.businessIban });
    } catch (error) { next(error); }
};

// ─── Slot hesaplama ve rezervasyon ────────────────────────────────────────────

export const getVenueSlots = async (req, res, next) => {
    try {
        const { id, courtId } = req.params;
        const { date } = req.query;
        if (!date) return res.status(400).json({ message: 'date parametresi gerekli (YYYY-MM-DD)' });

        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.status !== 'APPROVED') return res.status(404).json({ message: 'Tesis bulunamadı' });

        const reservations = await prisma.courtReservation.findMany({
            where: { venueId: id, courtId },
        });

        res.json(computeSlots(venue, reservations, date));
    } catch (error) { next(error); }
};

export const makeReservation = async (req, res, next) => {
    try {
        const { id, courtId } = req.params;
        const { date, startTime, endTime, paymentMethod, notes } = req.body;

        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.status !== 'APPROVED') return res.status(404).json({ message: 'Tesis bulunamadı' });

        if (!date || !startTime || !endTime) return res.status(400).json({ message: 'Tarih, başlangıç ve bitiş saati zorunludur' });

        const startMins = toMins(startTime);
        const endMins   = toMins(endTime);
        if (endMins - startMins < 60) return res.status(400).json({ message: 'Minimum rezervasyon süresi 1 saattir' });

        // Çakışma kontrolü
        const existing = await prisma.courtReservation.findMany({
            where: { venueId: id, courtId, date, status: { not: 'CANCELLED' } },
        });
        const hasConflict = existing.some(r => overlaps(startMins, endMins, toMins(r.startTime), toMins(r.endTime)));
        if (hasConflict) return res.status(409).json({ message: 'Bu saat aralığı dolu' });

        const reservation = await prisma.courtReservation.create({
            data: { venueId: id, courtId, userId: req.userId, date, startTime, endTime,
                    paymentMethod: paymentMethod || 'CASH', notes: notes || null },
        });

        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
        const court = await prisma.venueCourt.findUnique({ where: { id: courtId } });
        await createNotification(venue.userId, 'RESERVATION', '📅 Yeni Rezervasyon',
            `${user?.username}, ${venue.name} — ${court?.name || 'Kort'} için ${date} tarihinde ${startTime}–${endTime} rezervasyon yaptı.`,
            { reservationId: reservation.id }
        );
        emitToUser(venue.userId, 'notification', {});

        res.status(201).json({ reservation });
    } catch (error) { next(error); }
};

export const getVenueReservations = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const reservations = await prisma.courtReservation.findMany({
            where: { venueId: id },
            include: {
                user:  { select: { id: true, username: true, fullName: true, avatar: true } },
                court: true,
            },
            orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
        });
        res.json(reservations);
    } catch (error) { next(error); }
};

export const cancelReservation = async (req, res, next) => {
    try {
        const { resId } = req.params;
        const res_ = await prisma.courtReservation.findUnique({ where: { id: resId } });
        if (!res_) return res.status(404).json({ message: 'Rezervasyon bulunamadı' });
        if (res_.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.courtReservation.update({ where: { id: resId }, data: { status: 'CANCELLED' } });
        res.json({ message: 'İptal edildi' });
    } catch (error) { next(error); }
};

// ─── Genel arama (tüm kullanıcılar) ─────────────────────────────────────────

export const searchVenues = async (req, res, next) => {
    try {
        const { city, branch } = req.query;
        const venues = await prisma.businessVenue.findMany({
            where: {
                status: 'APPROVED',
                ...(city   ? { city:   { contains: city,   mode: 'insensitive' } } : {}),
                ...(branch ? { branch: { contains: branch, mode: 'insensitive' } } : {}),
            },
            include: {
                courts: true,
                user: { select: { id: true, username: true, businessName: true, businessIban: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(venues);
    } catch (error) { next(error); }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const getPendingVenues = async (req, res, next) => {
    try {
        const venues = await prisma.businessVenue.findMany({
            where: { status: 'PENDING' },
            include: {
                courts: true,
                user: { select: { id: true, username: true, businessName: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        res.json(venues);
    } catch (error) { next(error); }
};

export const approveVenue = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue) return res.status(404).json({ message: 'Bulunamadı' });
        await prisma.businessVenue.update({ where: { id }, data: { status: 'APPROVED' } });
        await createNotification(venue.userId, 'VENUE_APPROVED', '✅ Tesis Onaylandı',
            `"${venue.name}" tesisi onaylandı. Kullanıcılar artık rezervasyon yapabilir.`,
            { venueId: id }
        );
        emitToUser(venue.userId, 'notification', {});
        res.json({ message: 'Onaylandı' });
    } catch (error) { next(error); }
};

export const rejectVenue = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue) return res.status(404).json({ message: 'Bulunamadı' });
        await prisma.businessVenue.update({ where: { id }, data: { status: 'REJECTED', adminNote: adminNote || null } });
        await createNotification(venue.userId, 'VENUE_REJECTED', '❌ Tesis Reddedildi',
            adminNote || `"${venue.name}" tesisi reddedildi. Bilgilerinizi kontrol ederek tekrar deneyin.`,
            { venueId: id }
        );
        emitToUser(venue.userId, 'notification', {});
        res.json({ message: 'Reddedildi' });
    } catch (error) { next(error); }
};
