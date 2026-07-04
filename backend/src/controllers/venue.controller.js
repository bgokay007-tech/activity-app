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
        // Buçuklu saatler: 10:30-11:30, 11:30-12:30... (1-saatlik slotlar, :30'dan başlar)
        const slots = [];
        let start = open;
        if (start % 60 !== 30) {
            start = Math.floor(start / 60) * 60 + 30;
            if (start < open) start += 60;
        }
        for (let t = start; t + 60 <= close; t += 60) {
            slots.push({ start: toTime(t), end: toTime(t + 60), free: isFree(t, t + 60) });
        }
        return { type: 'HALF_HOUR', slots };
    }

    if (venue.slotType === 'NINETY_MIN') {
        // 90 dakikalık slotlar, aralarında 30 dk temizlik boşluğu: 10:00-11:30 → 12:00-13:30
        const DURATION = 90;
        const PERIOD   = 120; // 90 dk slot + 30 dk boşluk
        const slots = [];
        for (let t = open; t + DURATION <= close; t += PERIOD) {
            slots.push({ start: toTime(t), end: toTime(t + DURATION), free: isFree(t, t + DURATION) });
        }
        return { type: 'NINETY_MIN', slots };
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

const VENUE_ALLOWED_PACKAGES = ['RAHATLATICI', 'PRO', 'PREMIUM'];

export const createVenue = async (req, res, next) => {
    try {
        const { name, branch, city, district, address, phone, openTime, closeTime, openDays, slotType, pricePerSlot, courts } = req.body;

        const now = new Date();
        const sub = await prisma.businessSubscription.findFirst({
            where: { userId: req.userId, status: 'ACTIVE', endDate: { gt: now } },
        });
        if (!sub) return res.status(403).json({ message: 'Tesis eklemek için aktif abonelik gerekli' });
        if (!VENUE_ALLOWED_PACKAGES.includes(sub.packageType))
            return res.status(403).json({ message: 'Tesis eklemek için en az Rahatlatıcı paket gereklidir' });

        // RAHATLATICI paketi için max 3 tesis; PRO ve PREMIUM sınırsız
        if (sub.packageType === 'RAHATLATICI') {
            const count = await prisma.businessVenue.count({ where: { userId: req.userId } });
            if (count >= 3)
                return res.status(403).json({ message: 'Rahatlatıcı pakette en fazla 3 tesis ekleyebilirsiniz. Daha fazlası için Pro pakete geçin.' });
        }

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
                pricePerSlot: pricePerSlot ? parseInt(pricePerSlot) : 0,
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
        const { businessIban, businessIbanHolder } = req.body;
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        if (!user?.isBusiness) return res.status(403).json({ message: 'Yalnızca işletme hesapları' });
        const updated = await prisma.user.update({
            where: { id: req.userId },
            data: { businessIban, businessIbanHolder: businessIbanHolder || null },
        });
        res.json({ businessIban: updated.businessIban, businessIbanHolder: updated.businessIbanHolder });
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

        const isBlocked = await prisma.venueBlock.findUnique({
            where: { venueId_userId: { venueId: id, userId: req.userId } },
        });
        if (isBlocked) return res.status(403).json({ message: 'Bu tesiste rezervasyon yapamazsınız' });

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

export const getOwnerSchedule = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { date } = req.query;
        if (!date) return res.status(400).json({ message: 'date parametresi gerekli (YYYY-MM-DD)' });

        const venue = await prisma.businessVenue.findUnique({
            where: { id },
            include: { courts: { orderBy: { name: 'asc' } } },
        });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const allRes = await prisma.courtReservation.findMany({
            where: { venueId: id, date, status: { not: 'CANCELLED' } },
            include: { user: { select: { id: true, username: true, fullName: true } } },
        });

        const open  = toMins(venue.openTime);
        const close = toMins(venue.closeTime);

        const findRes = (courtId, s, e) =>
            allRes.filter(r => r.courtId === courtId && overlaps(s, e, toMins(r.startTime), toMins(r.endTime)));

        const buildSlots = (courtId) => {
            const { slotType } = venue;
            const slots = [];

            if (slotType === 'FULL_HOUR') {
                for (let t = open; t + 60 <= close; t += 60) {
                    const rs = findRes(courtId, t, t + 60);
                    slots.push({ start: toTime(t), end: toTime(t + 60), status: rs[0]?.status || 'FREE', user: rs[0]?.user || null });
                }
            } else if (slotType === 'HALF_HOUR') {
                let start = open;
                if (start % 60 !== 30) { start = Math.floor(start / 60) * 60 + 30; if (start < open) start += 60; }
                for (let t = start; t + 60 <= close; t += 60) {
                    const rs = findRes(courtId, t, t + 60);
                    slots.push({ start: toTime(t), end: toTime(t + 60), status: rs[0]?.status || 'FREE', user: rs[0]?.user || null });
                }
            } else if (slotType === 'NINETY_MIN') {
                for (let t = open; t + 90 <= close; t += 120) {
                    const rs = findRes(courtId, t, t + 90);
                    slots.push({ start: toTime(t), end: toTime(t + 90), status: rs[0]?.status || 'FREE', user: rs[0]?.user || null });
                }
            } else {
                // FLEXIBLE — show reservations as-is
                allRes.filter(r => r.courtId === courtId).forEach(r => {
                    slots.push({ start: r.startTime, end: r.endTime, status: r.status, user: r.user });
                });
            }
            return slots;
        };

        const courts = venue.courts.map(court => ({
            courtId:   court.id,
            courtName: court.name,
            slots:     buildSlots(court.id),
        }));

        res.json({ slotType: venue.slotType, openTime: venue.openTime, closeTime: venue.closeTime, courts });
    } catch (error) { next(error); }
};

export const getVenueAnalytics = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { from, to } = req.query;
        if (!from || !to) return res.status(400).json({ message: 'from ve to parametreleri gerekli (YYYY-MM-DD)' });

        const venue = await prisma.businessVenue.findUnique({
            where: { id },
            include: { courts: true },
        });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const reservations = await prisma.courtReservation.findMany({
            where: { venueId: id, date: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
        });

        // Gün sayısı
        const msPerDay = 86400000;
        const numDays  = Math.round((new Date(to) - new Date(from)) / msPerDay) + 1;
        const numCourts = venue.courts.length;

        // Günlük slot sayısı
        const oMin = toMins(venue.openTime), cMin = toMins(venue.closeTime);
        let slotsPerDay = 0;
        if (venue.slotType === 'FULL_HOUR')   slotsPerDay = Math.floor((cMin - oMin) / 60);
        else if (venue.slotType === 'HALF_HOUR')   slotsPerDay = Math.floor((cMin - oMin) / 60);
        else if (venue.slotType === 'NINETY_MIN')  slotsPerDay = Math.floor((cMin - oMin) / 120);
        else slotsPerDay = Math.floor((cMin - oMin) / 60); // FLEXIBLE estimate

        const totalPossible = numCourts * numDays * slotsPerDay;
        const totalBooked   = reservations.length;
        const occupancyRate = totalPossible > 0 ? Math.round((totalBooked / totalPossible) * 100) : 0;

        // Saatlere göre yoğunluk
        const hourMap = {};
        reservations.forEach(r => {
            const h = r.startTime.slice(0, 2) + ':00';
            hourMap[h] = (hourMap[h] || 0) + 1;
        });
        const busyHours = Object.entries(hourMap)
            .map(([hour, count]) => ({ hour, count }))
            .sort((a, b) => b.count - a.count);

        // Haftanın günlerine göre yoğunluk
        const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
        const dayMap = {};
        reservations.forEach(r => {
            const d = DAY_NAMES[new Date(r.date + 'T12:00:00').getDay()];
            dayMap[d] = (dayMap[d] || 0) + 1;
        });
        const busyDays = Object.entries(dayMap)
            .map(([day, count]) => ({ day, count }))
            .sort((a, b) => b.count - a.count);

        // Günlük dağılım
        const dailyMap = {};
        reservations.forEach(r => { dailyMap[r.date] = (dailyMap[r.date] || 0) + 1; });
        const daily = Object.entries(dailyMap)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Tahmini gelir
        const totalRevenue = totalBooked * (venue.pricePerSlot || 0);

        res.json({
            occupancyRate, totalBooked, totalPossible, totalRevenue,
            busyHours, busyDays, daily,
            meta: { from, to, numDays, numCourts, slotsPerDay },
        });
    } catch (error) { next(error); }
};

export const getMyReservations = async (req, res, next) => {
    try {
        const reservations = await prisma.courtReservation.findMany({
            where: { userId: req.userId },
            include: {
                venue: { select: { id: true, name: true, branch: true, city: true, district: true, address: true, phone: true } },
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
        const { city, branch, name } = req.query;

        // Yalnızca aktif PRO veya PREMIUM aboneliği olan işletmecilerin tesisleri listelenir
        const now = new Date();
        const proSubs = await prisma.businessSubscription.findMany({
            where: { status: 'ACTIVE', endDate: { gt: now }, packageType: { in: ['PRO', 'PREMIUM'] } },
            select: { userId: true },
        });
        const proUserIds = proSubs.map(s => s.userId);

        const venues = await prisma.businessVenue.findMany({
            where: {
                status: 'APPROVED',
                userId: { in: proUserIds },
                ...(city   ? { city:   { contains: city,   mode: 'insensitive' } } : {}),
                ...(branch ? { branch: { contains: branch, mode: 'insensitive' } } : {}),
                ...(name   ? {
                    OR: [
                        { name:   { contains: name, mode: 'insensitive' } },
                        { courts: { some: { name: { contains: name, mode: 'insensitive' } } } },
                    ],
                } : {}),
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

export const getVenueById = async (req, res, next) => {
    try {
        const venue = await prisma.businessVenue.findUnique({
            where: { id: req.params.id, status: 'APPROVED' },
            include: {
                courts: true,
                user: { select: { id: true, username: true, businessName: true, businessIban: true, businessIbanHolder: true } },
            },
        });
        if (!venue) return res.status(404).json({ message: 'Tesis bulunamadı' });
        res.json(venue);
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

// ─── Kullanıcı Engelleme ──────────────────────────────────────────────────────

export const blockUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { username } = req.body;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        const target = await prisma.user.findUnique({ where: { username } });
        if (!target) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
        if (target.id === req.userId) return res.status(400).json({ message: 'Kendinizi engelleyemezsiniz' });
        const block = await prisma.venueBlock.upsert({
            where: { venueId_userId: { venueId: id, userId: target.id } },
            update: {},
            create: { venueId: id, userId: target.id },
        });
        res.status(201).json({ block, user: { id: target.id, username: target.username, avatar: target.avatar } });
    } catch (error) { next(error); }
};

export const unblockUser = async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.venueBlock.deleteMany({ where: { venueId: id, userId } });
        res.json({ message: 'Engel kaldırıldı' });
    } catch (error) { next(error); }
};

export const getBlockedUsers = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        const blocks = await prisma.venueBlock.findMany({
            where: { venueId: id },
            include: { user: { select: { id: true, username: true, avatar: true, fullName: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(blocks);
    } catch (error) { next(error); }
};

// ─── Menü Yönetimi ────────────────────────────────────────────────────────────

const PRO_PACKAGES = ['PRO', 'PREMIUM'];

const assertProVenueOwner = async (venueId, userId) => {
    const venue = await prisma.businessVenue.findUnique({ where: { id: venueId } });
    if (!venue || venue.userId !== userId) return { error: 'Yetkisiz', status: 403 };
    const now = new Date();
    const sub = await prisma.businessSubscription.findFirst({
        where: { userId, status: 'ACTIVE', endDate: { gt: now } },
    });
    if (!sub || !PRO_PACKAGES.includes(sub.packageType))
        return { error: 'Menü özelliği için Pro veya Premium paket gereklidir', status: 403 };
    return { venue, sub };
};

export const addMenuItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, price, category } = req.body;
        const check = await assertProVenueOwner(id, req.userId);
        if (check.error) return res.status(check.status).json({ message: check.error });
        if (!name?.trim()) return res.status(400).json({ message: 'İsim zorunludur' });
        const item = await prisma.venueMenuItem.create({
            data: { venueId: id, name: name.trim(), price: parseInt(price) || 0, category: category || 'OTHER' },
        });
        res.status(201).json({ item });
    } catch (error) { next(error); }
};

export const updateMenuItem = async (req, res, next) => {
    try {
        const { id, itemId } = req.params;
        const { name, price, category, available } = req.body;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        const item = await prisma.venueMenuItem.update({
            where: { id: itemId },
            data: {
                ...(name      !== undefined ? { name: name.trim() }         : {}),
                ...(price     !== undefined ? { price: parseInt(price) || 0 } : {}),
                ...(category  !== undefined ? { category }                  : {}),
                ...(available !== undefined ? { available }                 : {}),
            },
        });
        res.json({ item });
    } catch (error) { next(error); }
};

export const deleteMenuItem = async (req, res, next) => {
    try {
        const { id, itemId } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.venueMenuItem.delete({ where: { id: itemId } });
        res.json({ message: 'Silindi' });
    } catch (error) { next(error); }
};

export const getVenueMenu = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.status !== 'APPROVED') return res.status(404).json({ message: 'Tesis bulunamadı' });

        const now = new Date();
        const sub = await prisma.businessSubscription.findFirst({
            where: { userId: venue.userId, status: 'ACTIVE', endDate: { gt: now } },
        });
        if (!sub || !PRO_PACKAGES.includes(sub.packageType))
            return res.json({ items: [], hasMenu: false });

        const items = await prisma.venueMenuItem.findMany({
            where: { venueId: id },
            orderBy: [{ category: 'asc' }, { name: 'asc' }],
        });
        res.json({ items, hasMenu: true });
    } catch (error) { next(error); }
};

// ─── Sipariş ──────────────────────────────────────────────────────────────────

export const placeOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { items, notes } = req.body; // items: [{menuItemId, quantity}]
        if (!items?.length) return res.status(400).json({ message: 'En az bir ürün seçin' });

        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.status !== 'APPROVED') return res.status(404).json({ message: 'Tesis bulunamadı' });

        // Blocked kontrolü
        const isBlocked = await prisma.venueBlock.findUnique({
            where: { venueId_userId: { venueId: id, userId: req.userId } },
        });
        if (isBlocked) return res.status(403).json({ message: 'Bu tesisten sipariş veremezsiniz' });

        // Menu item fiyatlarını çek
        const menuItems = await prisma.venueMenuItem.findMany({
            where: { id: { in: items.map(i => i.menuItemId) }, venueId: id, available: true },
        });
        if (menuItems.length === 0) return res.status(400).json({ message: 'Seçilen ürünler mevcut değil' });

        const totalPrice = items.reduce((sum, i) => {
            const mi = menuItems.find(m => m.id === i.menuItemId);
            return mi ? sum + mi.price * (i.quantity || 1) : sum;
        }, 0);

        const order = await prisma.venueOrder.create({
            data: {
                venueId: id, userId: req.userId,
                totalPrice, notes: notes || null,
                items: {
                    create: items.flatMap(i => {
                        const mi = menuItems.find(m => m.id === i.menuItemId);
                        if (!mi) return [];
                        return [{ menuItemId: i.menuItemId, quantity: i.quantity || 1, unitPrice: mi.price }];
                    }),
                },
            },
            include: { items: { include: { menuItem: true } } },
        });

        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
        await createNotification(venue.userId, 'VENUE_ORDER', '🛒 Yeni Sipariş',
            `${user?.username} tesisinden sipariş verdi. Toplam: ${totalPrice}₺`,
            { orderId: order.id, venueId: id }
        );
        emitToUser(venue.userId, 'notification', {});

        res.status(201).json({ order });
    } catch (error) { next(error); }
};

export const getVenueOrders = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        const orders = await prisma.venueOrder.findMany({
            where: { venueId: id },
            include: {
                user:  { select: { id: true, username: true, avatar: true } },
                items: { include: { menuItem: { select: { name: true, category: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(orders);
    } catch (error) { next(error); }
};

export const getUserOrders = async (req, res, next) => {
    try {
        const orders = await prisma.venueOrder.findMany({
            where: { userId: req.userId },
            include: {
                venue: { select: { id: true, name: true } },
                items: { include: { menuItem: { select: { name: true } } } },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        res.json(orders);
    } catch (error) { next(error); }
};

export const updateOrderStatus = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        const VALID = ['CONFIRMED', 'READY', 'CANCELLED'];
        if (!VALID.includes(status)) return res.status(400).json({ message: 'Geçersiz durum' });

        const order = await prisma.venueOrder.findUnique({ where: { id: orderId }, include: { venue: true } });
        if (!order) return res.status(404).json({ message: 'Sipariş bulunamadı' });
        if (order.venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const updated = await prisma.venueOrder.update({ where: { id: orderId }, data: { status } });

        const statusMsg = { CONFIRMED: '✅ onaylandı', READY: '🟢 hazır', CANCELLED: '❌ iptal edildi' };
        await createNotification(order.userId, 'ORDER_STATUS', '📦 Sipariş Güncellendi',
            `${order.venue.name} siparişiniz ${statusMsg[status]}.`,
            { orderId, venueId: order.venueId }
        );
        emitToUser(order.userId, 'notification', {});

        res.json({ order: updated });
    } catch (error) { next(error); }
};
