import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const overlaps = (as, ae, bs, be) => as < be && ae > bs;

async function autoConfirmPastCash(venueId) {
    const now = new Date();
    const pending = await prisma.courtReservation.findMany({
        where: { venueId, status: 'PENDING', paymentMethod: 'CASH' },
    });
    const toConfirm = pending.filter(r => {
        const resStart = new Date(`${r.date}T${r.startTime}:00`);
        return (now - resStart) / 3600000 >= 4;
    });
    if (toConfirm.length > 0) {
        await prisma.courtReservation.updateMany({
            where: { id: { in: toConfirm.map(r => r.id) } },
            data: { status: 'CONFIRMED' },
        });
    }
}

// Gece yarısını geçen pencereleri (ör: 16:00–04:00) gece yarısında ikiye böler
function splitOvernight(windows) {
    const result = [];
    for (const w of windows) {
        const open  = toMins(w.from);
        const close = toMins(w.to);
        if (close < open) {
            // 16:00→1440(24:00) + 00:00→close
            if (open < 1440)  result.push({ from: w.from,  to: '24:00' });
            if (close > 0)    result.push({ from: '00:00', to: w.to });
        } else {
            result.push(w);
        }
    }
    return result.length > 0 ? result : [{ from: '00:00', to: '24:00' }];
}

// openSlots format: { "0":[global şablon], "1":[Pzt override], "courtId_1":[Pzt+Kort override] }
// Öncelik: kort+gün > gün > global şablon('0') > tesis varsayılanı
// Kapalı: ilgili key = [] (boş dizi)
function getOpenWindows(venue, date, courtId = null) {
    const os = venue.openSlots;
    let raw;
    if (os && !Array.isArray(os) && typeof os === 'object') {
        const dow = new Date(date + 'T12:00:00').getDay();
        const key = String(dow === 0 ? 7 : dow);
        const courtDayKey = courtId ? `${courtId}_${key}` : null;

        let entry;
        if (courtDayKey && os[courtDayKey] !== undefined) entry = os[courtDayKey];
        else if (os[key] !== undefined)                   entry = os[key];
        else if (os['0'] !== undefined)                   entry = os['0'];

        if (entry !== undefined) {
            if (Array.isArray(entry) && entry.length === 0) return []; // Kapalı
            raw = (Array.isArray(entry) && entry.length > 0) ? entry : [{ from: venue.openTime, to: venue.closeTime }];
        } else {
            raw = [{ from: venue.openTime, to: venue.closeTime }];
        }
    } else if (Array.isArray(os) && os.length > 0) {
        raw = os;
    } else {
        raw = [{ from: venue.openTime, to: venue.closeTime }];
    }
    return splitOvernight(raw);
}

function computeSlots(venue, reservations, date, courtId = null) {
    const openWindows = getOpenWindows(venue, date, courtId);

    const taken = reservations
        .filter(r => r.date === date && r.status !== 'CANCELLED')
        .map(r => ({ s: toMins(r.startTime), e: toMins(r.endTime) }))
        .sort((a, b) => a.s - b.s);

    const isFree = (s, e) => !taken.some(r => overlaps(s, e, r.s, r.e));

    if (venue.slotType === 'FULL_HOUR') {
        const slots = [];
        for (const w of openWindows) {
            const open = toMins(w.from), close = toMins(w.to);
            for (let t = open; t + 60 <= close; t += 60)
                slots.push({ start: toTime(t), end: toTime(t + 60), free: isFree(t, t + 60) });
        }
        return { type: 'FULL_HOUR', slots };
    }

    if (venue.slotType === 'HALF_HOUR') {
        const slots = [];
        for (const w of openWindows) {
            let open = toMins(w.from);
            const close = toMins(w.to);
            if (open % 60 !== 30) { open = Math.floor(open / 60) * 60 + 30; if (open < toMins(w.from)) open += 60; }
            for (let t = open; t + 60 <= close; t += 60)
                slots.push({ start: toTime(t), end: toTime(t + 60), free: isFree(t, t + 60) });
        }
        return { type: 'HALF_HOUR', slots };
    }

    if (venue.slotType === 'NINETY_MIN') {
        const slots = [];
        for (const w of openWindows) {
            const open = toMins(w.from), close = toMins(w.to);
            for (let t = open; t + 90 <= close; t += 120)
                slots.push({ start: toTime(t), end: toTime(t + 90), free: isFree(t, t + 90) });
        }
        return { type: 'NINETY_MIN', slots };
    }

    if (venue.slotType === 'VAR_DURATION') {
        const windows = [];
        for (const w of openWindows) {
            const open = toMins(w.from), close = toMins(w.to);
            const wTaken = taken.filter(r => r.s < close && r.e > open).sort((a, b) => a.s - b.s);
            let prev = open;
            for (const r of wTaken) {
                if (r.s > prev && r.s - prev >= 60)
                    windows.push({ start: toTime(prev), end: toTime(r.s), durationMins: r.s - prev });
                prev = Math.max(prev, r.e);
            }
            if (prev < close && close - prev >= 60)
                windows.push({ start: toTime(prev), end: toTime(close), durationMins: close - prev });
        }
        return { type: 'VAR_DURATION', windows };
    }

    // FLEXIBLE
    const windows = [];
    for (const w of openWindows) {
        const open = toMins(w.from), close = toMins(w.to);
        const wTaken = taken.filter(r => r.s < close && r.e > open).sort((a, b) => a.s - b.s);
        let prev = open;
        for (const r of wTaken) {
            if (r.s > prev) windows.push({ start: toTime(prev), end: toTime(r.s), durationMins: r.s - prev });
            prev = Math.max(prev, r.e);
        }
        if (prev < close) windows.push({ start: toTime(prev), end: toTime(close), durationMins: close - prev });
    }
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
            include: { courts: { orderBy: { name: 'asc' } } },
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

        const [venue, court] = await Promise.all([
            prisma.businessVenue.findUnique({ where: { id } }),
            prisma.venueCourt.findUnique({ where: { id: courtId } }),
        ]);
        if (!venue || venue.status !== 'APPROVED') return res.status(404).json({ message: 'Tesis bulunamadı' });

        const reservations = await prisma.courtReservation.findMany({
            where: { venueId: id, courtId },
        });

        const effectiveVenue = { ...venue, slotType: court?.slotType || venue.slotType };
        const slotsResult = computeSlots(effectiveVenue, reservations, date, courtId);
        const accepted = Array.isArray(venue.acceptedPayments) ? venue.acceptedPayments : ['CASH', 'EFT'];
        res.json({ ...slotsResult, acceptedPayments: accepted });
    } catch (error) { next(error); }
};

export const updateCourtSettings = async (req, res, next) => {
    try {
        const { id, courtId } = req.params;
        const { slotType, surface, lightsFrom } = req.body;
        const VALID_TYPES    = ['FULL_HOUR', 'HALF_HOUR', 'VAR_DURATION'];
        const VALID_SURFACES = ['CLAY', 'HARD', 'CARPET', 'GRASS', 'PARQUET', 'SYNTHETIC'];
        if (slotType && !VALID_TYPES.includes(slotType))
            return res.status(400).json({ message: 'Geçersiz slot tipi' });
        if (surface && !VALID_SURFACES.includes(surface))
            return res.status(400).json({ message: 'Geçersiz zemin tipi' });
        if (lightsFrom !== undefined && lightsFrom !== null && !/^\d{2}:\d{2}$/.test(lightsFrom))
            return res.status(400).json({ message: 'Geçersiz ışık saati formatı (HH:MM)' });

        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const data = {};
        if (slotType    !== undefined) data.slotType    = slotType    || null;
        if (surface     !== undefined) data.surface     = surface     || null;
        if (lightsFrom  !== undefined) data.lightsFrom  = lightsFrom  || null;

        const court = await prisma.venueCourt.update({ where: { id: courtId }, data });
        res.json({ court });
    } catch (e) { next(e); }
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

        const accepted = Array.isArray(venue.acceptedPayments) ? venue.acceptedPayments : ['CASH', 'EFT'];
        if (paymentMethod && !accepted.includes(paymentMethod))
            return res.status(400).json({ message: 'Bu tesis seçilen ödeme yöntemini kabul etmiyor' });

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

        await autoConfirmPastCash(id);

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

export const updateVenueSettings = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { slotType, pricePerSlot, openSlots, cancelHoursBefore, rescheduleHoursBefore, acceptedPayments } = req.body;
        const VALID_TYPES = ['FULL_HOUR', 'HALF_HOUR', 'VAR_DURATION'];
        const VALID_PAY   = ['CASH', 'EFT', 'ONLINE'];
        if (slotType && !VALID_TYPES.includes(slotType))
            return res.status(400).json({ message: 'Geçersiz slot tipi' });
        if (acceptedPayments !== undefined) {
            if (!Array.isArray(acceptedPayments) || acceptedPayments.length === 0 || acceptedPayments.some(m => !VALID_PAY.includes(m)))
                return res.status(400).json({ message: 'Geçersiz ödeme yöntemi' });
        }

        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const data = {};
        if (slotType !== undefined)              data.slotType             = slotType;
        if (pricePerSlot !== undefined)          data.pricePerSlot         = parseInt(pricePerSlot) || 0;
        if (openSlots !== undefined)             data.openSlots            = openSlots;
        if (acceptedPayments !== undefined)      data.acceptedPayments     = acceptedPayments;
        if (cancelHoursBefore !== undefined)     data.cancelHoursBefore    = cancelHoursBefore === null ? null : parseInt(cancelHoursBefore);
        if (rescheduleHoursBefore !== undefined) data.rescheduleHoursBefore = rescheduleHoursBefore === null ? null : parseInt(rescheduleHoursBefore);

        const updated = await prisma.businessVenue.update({ where: { id }, data });
        res.json({ venue: updated });
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

        const findRes = (courtId, s, e) =>
            allRes.filter(r => r.courtId === courtId && overlaps(s, e, toMins(r.startTime), toMins(r.endTime)));

        const buildSlots = (court) => {
            const effectiveSlotType = court.slotType || venue.slotType;
            const courtWindows = getOpenWindows(venue, date, court.id); // kort bazlı windows
            const slots = [];

            for (const w of courtWindows) {
                const open = toMins(w.from), close = toMins(w.to);

                if (effectiveSlotType === 'FULL_HOUR') {
                    for (let t = open; t + 60 <= close; t += 60) {
                        const rs = findRes(court.id, t, t + 60);
                        slots.push({ start: toTime(t), end: toTime(t + 60), status: rs[0]?.status || 'FREE', user: rs[0]?.user || null });
                    }
                } else if (effectiveSlotType === 'HALF_HOUR') {
                    let start = open;
                    if (start % 60 !== 30) { start = Math.floor(start / 60) * 60 + 30; if (start < open) start += 60; }
                    for (let t = start; t + 60 <= close; t += 60) {
                        const rs = findRes(court.id, t, t + 60);
                        slots.push({ start: toTime(t), end: toTime(t + 60), status: rs[0]?.status || 'FREE', user: rs[0]?.user || null });
                    }
                } else if (effectiveSlotType === 'NINETY_MIN') {
                    for (let t = open; t + 90 <= close; t += 120) {
                        const rs = findRes(court.id, t, t + 90);
                        slots.push({ start: toTime(t), end: toTime(t + 90), status: rs[0]?.status || 'FREE', user: rs[0]?.user || null });
                    }
                } else {
                    // VAR_DURATION / FLEXIBLE
                    const courtRes = allRes
                        .filter(r => r.courtId === court.id && toMins(r.startTime) < close && toMins(r.endTime) > open)
                        .sort((a, b) => toMins(a.startTime) - toMins(b.startTime));
                    let prev = open;
                    for (const r of courtRes) {
                        const rStart = toMins(r.startTime);
                        if (rStart > prev && rStart - prev >= 60)
                            slots.push({ start: toTime(prev), end: toTime(rStart), status: 'FREE', user: null });
                        slots.push({ start: r.startTime, end: r.endTime, status: r.status, user: r.user });
                        prev = Math.max(prev, toMins(r.endTime));
                    }
                    if (prev < close && close - prev >= 60)
                        slots.push({ start: toTime(prev), end: toTime(close), status: 'FREE', user: null });
                }
            }
            return slots;
        };

        const courts = venue.courts.map(court => ({
            courtId:   court.id,
            courtName: court.name,
            slotType:  court.slotType || venue.slotType,
            surface:   court.surface || null,
            slots:     buildSlots(court),
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
                venue: { select: { id: true, name: true, branch: true, city: true, district: true, address: true, phone: true, pricePerSlot: true, cancelHoursBefore: true, rescheduleHoursBefore: true, acceptedPayments: true } },
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
        const res_ = await prisma.courtReservation.findUnique({
            where: { id: resId },
            include: { venue: true },
        });
        if (!res_) return res.status(404).json({ message: 'Rezervasyon bulunamadı' });
        const isOwner      = res_.userId === req.userId;
        const isVenueOwner = res_.venue?.userId === req.userId;
        if (!isOwner && !isVenueOwner) return res.status(403).json({ message: 'Yetkisiz' });

        // Kullanıcı iptal ediyorsa politika kontrolü
        if (isOwner && !isVenueOwner) {
            const cb = res_.venue?.cancelHoursBefore;
            if (cb !== null && cb !== undefined) {
                if (cb < 0) return res.status(403).json({ message: 'Bu tesis rezervasyon iptale izin vermiyor' });
                const resDate = new Date(`${res_.date}T${res_.startTime}:00`);
                const hoursLeft = (resDate - new Date()) / 3600000;
                if (hoursLeft < cb)
                    return res.status(403).json({ message: `Rezervasyondan ${cb} saat öncesine kadar iptal yapılabilir` });
            }
        }

        await prisma.courtReservation.update({ where: { id: resId }, data: { status: 'CANCELLED' } });
        res.json({ message: 'İptal edildi' });
    } catch (error) { next(error); }
};

export const updateReservationStatus = async (req, res, next) => {
    try {
        const { resId } = req.params;
        const { action } = req.body; // 'confirm' | 'noshow'
        const res_ = await prisma.courtReservation.findUnique({
            where: { id: resId },
            include: {
                venue: { select: { userId: true, name: true } },
                court: { select: { name: true } },
            },
        });
        if (!res_) return res.status(404).json({ message: 'Rezervasyon bulunamadı' });
        if (res_.venue?.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const venueName  = res_.venue?.name || 'Tesis';
        const courtName  = res_.court?.name || 'Kort';
        const dateStr    = `${res_.date} ${res_.startTime}–${res_.endTime}`;
        const customerId = res_.userId;

        if (action === 'no_payment') {
            // Ödeme alınmadı — iptal et + admini bildir
            const updated = await prisma.courtReservation.update({ where: { id: resId }, data: { status: 'CANCELLED', noShow: true } });
            res.json({ reservation: updated });
            const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
            for (const admin of admins) {
                createNotification(admin.id, 'PAYMENT_ALERT', '🚨 Ödeme Alınmadı Uyarısı',
                    `${venueName} — ${courtName}: ${dateStr} rezervasyonunda ödeme alınmadı!`,
                    { reservationId: resId }
                ).catch(() => {});
            }
            createNotification(customerId, 'RESERVATION', '❌ Rezervasyon İptal Edildi',
                `${venueName} · ${courtName} — ${dateStr} rezervasyonunuz iptal edildi (ödeme alınamadı).`,
                { reservationId: resId }
            ).catch(() => {});
            emitToUser(customerId, 'reservationUpdate', { reservationId: resId, status: 'CANCELLED' });
            return;
        }

        const data = action === 'confirm'
            ? { status: 'CONFIRMED' }
            : { status: 'CANCELLED', noShow: true };
        const updated = await prisma.courtReservation.update({ where: { id: resId }, data });
        res.json({ reservation: updated });

        if (action === 'confirm') {
            createNotification(customerId, 'RESERVATION',
                '✅ Rezervasyonunuz Onaylandı',
                `${venueName} · ${courtName} — ${dateStr} rezervasyonunuz onaylandı.`,
                { reservationId: resId }
            ).catch(() => {});
            emitToUser(customerId, 'reservationUpdate', { reservationId: resId, status: 'CONFIRMED' });
        } else {
            createNotification(customerId, 'RESERVATION',
                '❌ Rezervasyon İptal Edildi',
                `${venueName} · ${courtName} — ${dateStr} rezervasyonunuz iptal edildi.`,
                { reservationId: resId }
            ).catch(() => {});
            emitToUser(customerId, 'reservationUpdate', { reservationId: resId, status: 'CANCELLED' });
        }
    } catch (e) { next(e); }
};

export const rescheduleReservation = async (req, res, next) => {
    try {
        const { resId } = req.params;
        const { newDate, newStartTime, newEndTime } = req.body;
        if (!newDate || !newStartTime || !newEndTime)
            return res.status(400).json({ message: 'newDate, newStartTime ve newEndTime zorunludur' });

        const res_ = await prisma.courtReservation.findUnique({
            where: { id: resId },
            include: { venue: true },
        });
        if (!res_) return res.status(404).json({ message: 'Rezervasyon bulunamadı' });
        if (res_.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        if (res_.status === 'CANCELLED') return res.status(400).json({ message: 'İptal edilmiş rezervasyon değiştirilemez' });

        const rb = res_.venue?.rescheduleHoursBefore;
        if (rb !== null && rb !== undefined) {
            if (rb < 0) return res.status(403).json({ message: 'Bu tesis rezervasyon değişikliğine izin vermiyor' });
            const resDate  = new Date(`${res_.date}T${res_.startTime}:00`);
            const hoursLeft = (resDate - new Date()) / 3600000;
            if (hoursLeft < rb)
                return res.status(403).json({ message: `Rezervasyondan ${rb} saat öncesine kadar değişiklik yapılabilir` });
        }

        // Çakışma kontrolü
        const existing = await prisma.courtReservation.findMany({
            where: { venueId: res_.venueId, courtId: res_.courtId, date: newDate, status: { not: 'CANCELLED' }, NOT: { id: resId } },
        });
        const hasConflict = existing.some(r =>
            overlaps(toMins(newStartTime), toMins(newEndTime), toMins(r.startTime), toMins(r.endTime))
        );
        if (hasConflict) return res.status(409).json({ message: 'Seçilen saat aralığı dolu' });

        const updated = await prisma.courtReservation.update({
            where: { id: resId },
            data: { date: newDate, startTime: newStartTime, endTime: newEndTime, status: 'PENDING' },
        });

        await createNotification(res_.venue.userId, 'RESERVATION', '📅 Rezervasyon Güncellendi',
            `Rezervasyon tarihi değiştirildi: ${newDate} ${newStartTime}–${newEndTime}`,
            { reservationId: resId }
        ).catch(() => {});
        emitToUser(res_.venue.userId, 'notification', {});

        res.json({ reservation: updated });
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
