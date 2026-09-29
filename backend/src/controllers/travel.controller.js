import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };
const USER_WITH_BADGE = { ...USER_SELECT, travelVerification: { select: { status: true } } };
const NOTIF_DATA = { category: 'SOCIAL', subCategory: 'travel_explore' };

const toStrList = (v) => (Array.isArray(v) ? v.map(x => String(x || '').trim()).filter(Boolean).slice(0, 20) : []);

const toMediaList = (v) => (Array.isArray(v)
    ? v.filter(m => m && typeof m.url === 'string' && m.url.startsWith('http'))
        .map(m => ({ url: m.url, type: m.type === 'video' ? 'video' : 'image' }))
        .slice(0, 20)
    : []);

// Rozet için sadece "doğrulanmış mı" bilgisi dışarı çıkar — belge/TC asla.
const withBadge = (u) => {
    if (!u) return u;
    const { travelVerification, ...rest } = u;
    return { ...rest, travelVerified: travelVerification?.status === 'APPROVED' };
};

async function recalcRouteRating(routeId) {
    const agg = await prisma.travelRouteReview.aggregate({
        where: { routeId }, _avg: { rating: true }, _count: { rating: true },
    });
    await prisma.travelRoute.update({
        where: { id: routeId },
        data: { ratingAvg: agg._avg.rating || 0, ratingCount: agg._count.rating || 0 },
    });
}

// ─── Rotalar ────────────────────────────────────────────────────────────────

export const getRoutes = async (req, res, next) => {
    try {
        const { q, sort, mine } = req.query;
        const where = {};
        if (mine === 'true') where.userId = req.userId;
        if (q && String(q).trim().length >= 2) {
            const term = String(q).trim();
            where.OR = [
                { title: { contains: term, mode: 'insensitive' } },
                { startPlace: { contains: term, mode: 'insensitive' } },
                { endPlace: { contains: term, mode: 'insensitive' } },
            ];
        }
        const orderBy = sort === 'top'
            ? [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }]
            : [{ createdAt: 'desc' }];
        const routes = await prisma.travelRoute.findMany({
            where, orderBy, take: 100,
            include: { user: { select: USER_SELECT } },
        });
        res.json(routes);
    } catch (err) { next(err); }
};

export const getRoute = async (req, res, next) => {
    try {
        const route = await prisma.travelRoute.findUnique({
            where: { id: req.params.id },
            include: {
                user: { select: USER_SELECT },
                reviews: { include: { user: { select: USER_SELECT } }, orderBy: { createdAt: 'desc' } },
            },
        });
        if (!route) return res.status(404).json({ message: 'Rota bulunamadı' });
        res.json(route);
    } catch (err) { next(err); }
};

export const createRoute = async (req, res, next) => {
    try {
        const { title, startPlace, endPlace, stops, distanceKm, durationText, difficulty, experience, media } = req.body;
        if (!String(title || '').trim() || !String(startPlace || '').trim())
            return res.status(400).json({ message: 'Rota adı ve başlangıç noktası zorunludur' });
        const dist = distanceKm != null && distanceKm !== '' ? parseFloat(distanceKm) : null;
        const route = await prisma.travelRoute.create({
            data: {
                userId: req.userId,
                title: String(title).trim(),
                startPlace: String(startPlace).trim(),
                endPlace: endPlace ? String(endPlace).trim() : null,
                stops: toStrList(stops),
                distanceKm: Number.isFinite(dist) && dist > 0 ? dist : null,
                durationText: durationText ? String(durationText).trim() : null,
                difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) ? difficulty : null,
                experience: experience ? String(experience).trim() : null,
                media: toMediaList(media),
            },
            include: { user: { select: USER_SELECT } },
        });
        res.status(201).json(route);
    } catch (err) { next(err); }
};

export const addRouteMedia = async (req, res, next) => {
    try {
        const route = await prisma.travelRoute.findUnique({ where: { id: req.params.id } });
        if (!route) return res.status(404).json({ message: 'Rota bulunamadı' });
        if (route.userId !== req.userId) return res.status(403).json({ message: 'Bu rota size ait değil' });
        const added = toMediaList(req.body.media);
        const media = [...(Array.isArray(route.media) ? route.media : []), ...added].slice(0, 30);
        const updated = await prisma.travelRoute.update({ where: { id: route.id }, data: { media } });
        res.json(updated);
    } catch (err) { next(err); }
};

export const deleteRoute = async (req, res, next) => {
    try {
        const route = await prisma.travelRoute.findUnique({ where: { id: req.params.id } });
        if (!route) return res.status(404).json({ message: 'Rota bulunamadı' });
        if (route.userId !== req.userId) return res.status(403).json({ message: 'Bu rota size ait değil' });
        await prisma.travelRoute.delete({ where: { id: route.id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};

export const reviewRoute = async (req, res, next) => {
    try {
        const rating = parseInt(req.body.rating, 10);
        if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ message: 'Puan 1-5 arası olmalı' });
        const route = await prisma.travelRoute.findUnique({ where: { id: req.params.id } });
        if (!route) return res.status(404).json({ message: 'Rota bulunamadı' });
        if (route.userId === req.userId) return res.status(400).json({ message: 'Kendi rotanızı puanlayamazsınız' });
        const comment = req.body.comment ? String(req.body.comment).trim() : null;
        const media = toMediaList(req.body.media);
        const review = await prisma.travelRouteReview.upsert({
            where: { routeId_userId: { routeId: route.id, userId: req.userId } },
            create: { routeId: route.id, userId: req.userId, rating, comment, media },
            update: { rating, comment, media },
            include: { user: { select: USER_SELECT } },
        });
        await recalcRouteRating(route.id);
        createNotification(route.userId, 'TRAVEL_ROUTE_REVIEW', '⭐ Rotanıza yorum geldi',
            `"${route.title}" rotanıza ${rating} yıldız verildi${comment ? `: ${comment.slice(0, 80)}` : ''}`,
            { ...NOTIF_DATA, routeId: route.id }).catch(() => {});
        res.json(review);
    } catch (err) { next(err); }
};

// ─── Doğrulama (kimlik + adli sicil) ────────────────────────────────────────

export const getMyVerification = async (req, res, next) => {
    try {
        const v = await prisma.travelVerification.findUnique({ where: { userId: req.userId } });
        res.json(v || null);
    } catch (err) { next(err); }
};

export const submitVerification = async (req, res, next) => {
    try {
        const { fullName, tcKimlikNo, birthDate, phone, idCardUrl, adliSicilUrl, selfieUrl } = req.body;
        if (!String(fullName || '').trim() || !String(phone || '').trim() || !idCardUrl || !adliSicilUrl || !birthDate)
            return res.status(400).json({ message: 'Tüm zorunlu alanları doldurun ve belgeleri yükleyin' });
        const tc = String(tcKimlikNo || '').replace(/\D/g, '');
        if (tc.length !== 11) return res.status(400).json({ message: 'Kimlik numarası 11 haneli olmalı' });
        const bd = new Date(birthDate);
        if (Number.isNaN(bd.getTime())) return res.status(400).json({ message: 'Doğum tarihi geçersiz' });
        const ageYears = (Date.now() - bd.getTime()) / (365.25 * 24 * 3600 * 1000);
        if (ageYears < 18) return res.status(400).json({ message: '18 yaşından küçükler başvuramaz' });

        // Her gönderim yeniden admin onayına düşer — onaylıyken belge değiştirilirse de.
        const data = {
            fullName: String(fullName).trim(), tcKimlikNo: tc, birthDate: bd, phone: String(phone).trim(),
            idCardUrl, adliSicilUrl, selfieUrl: selfieUrl || null,
            status: 'PENDING', adminNote: null,
        };
        const v = await prisma.travelVerification.upsert({
            where: { userId: req.userId },
            create: { userId: req.userId, ...data },
            update: data,
        });
        res.json(v);
    } catch (err) { next(err); }
};

// ─── Seyahatler ─────────────────────────────────────────────────────────────

const acceptedSeats = (trip) => (trip.requests || [])
    .filter(r => r.status === 'ACCEPTED')
    .reduce((sum, r) => sum + (r.seats || 1), 0);

const shapeTrip = (trip, viewerId) => {
    const isOwner = trip.userId === viewerId;
    const myRequest = (trip.requests || []).find(r => r.userId === viewerId) || null;
    return {
        ...trip,
        user: withBadge(trip.user),
        seatsLeft: Math.max(0, trip.seats - acceptedSeats(trip)),
        myRequest,
        // İstek listesi (kim, mesajı) sadece seyahat sahibine gider.
        requests: isOwner ? (trip.requests || []).map(r => ({ ...r, user: withBadge(r.user) })) : undefined,
        requestCount: isOwner ? (trip.requests || []).filter(r => r.status === 'PENDING').length : undefined,
    };
};

const TRIP_INCLUDE = {
    user: { select: USER_WITH_BADGE },
    requests: { include: { user: { select: USER_WITH_BADGE } }, orderBy: { createdAt: 'desc' } },
};

export const getTrips = async (req, res, next) => {
    try {
        const { from, to, mine } = req.query;
        const where = {};
        if (mine === 'true') {
            where.OR = [{ userId: req.userId }, { requests: { some: { userId: req.userId } } }];
        } else {
            where.status = 'ACTIVE';
            where.departAt = { gte: new Date(Date.now() - 2 * 3600 * 1000) };
            if (from && String(from).trim()) where.fromPlace = { contains: String(from).trim(), mode: 'insensitive' };
            if (to && String(to).trim()) where.toPlace = { contains: String(to).trim(), mode: 'insensitive' };
        }
        const trips = await prisma.travelTrip.findMany({
            where, include: TRIP_INCLUDE,
            orderBy: { departAt: mine === 'true' ? 'desc' : 'asc' }, take: 100,
        });
        res.json(trips.map(tr => shapeTrip(tr, req.userId)));
    } catch (err) { next(err); }
};

export const getTrip = async (req, res, next) => {
    try {
        const trip = await prisma.travelTrip.findUnique({ where: { id: req.params.id }, include: TRIP_INCLUDE });
        if (!trip) return res.status(404).json({ message: 'Seyahat bulunamadı' });
        res.json(shapeTrip(trip, req.userId));
    } catch (err) { next(err); }
};

export const createTrip = async (req, res, next) => {
    try {
        const v = await prisma.travelVerification.findUnique({ where: { userId: req.userId }, select: { status: true } });
        if (v?.status !== 'APPROVED')
            return res.status(403).json({ message: 'Yol arkadaşı alabilmek için kimlik ve adli sicil doğrulamanız onaylanmalı', code: 'VERIFICATION_REQUIRED' });

        const { fromPlace, toPlace, waypoints, departAt, seats, pricePerSeat, vehicle, note } = req.body;
        if (!String(fromPlace || '').trim() || !String(toPlace || '').trim())
            return res.status(400).json({ message: 'Başlangıç ve varış noktası zorunludur' });
        const dt = new Date(departAt);
        if (Number.isNaN(dt.getTime()) || dt.getTime() < Date.now() - 10 * 60 * 1000)
            return res.status(400).json({ message: 'Geçerli ve ileri bir tarih seçin' });
        const seatCount = Math.min(8, Math.max(1, parseInt(seats, 10) || 1));
        const price = Math.max(0, parseInt(pricePerSeat, 10) || 0);

        const trip = await prisma.travelTrip.create({
            data: {
                userId: req.userId,
                fromPlace: String(fromPlace).trim(),
                toPlace: String(toPlace).trim(),
                waypoints: toStrList(waypoints),
                departAt: dt,
                seats: seatCount,
                pricePerSeat: price,
                vehicle: vehicle ? String(vehicle).trim() : null,
                note: note ? String(note).trim() : null,
            },
            include: TRIP_INCLUDE,
        });
        res.status(201).json(shapeTrip(trip, req.userId));
    } catch (err) { next(err); }
};

export const cancelTrip = async (req, res, next) => {
    try {
        const trip = await prisma.travelTrip.findUnique({ where: { id: req.params.id }, include: { requests: true } });
        if (!trip) return res.status(404).json({ message: 'Seyahat bulunamadı' });
        if (trip.userId !== req.userId) return res.status(403).json({ message: 'Bu seyahat size ait değil' });
        await prisma.travelTrip.update({ where: { id: trip.id }, data: { status: 'CANCELLED' } });
        for (const r of trip.requests.filter(x => x.status === 'PENDING' || x.status === 'ACCEPTED')) {
            createNotification(r.userId, 'TRAVEL_TRIP_CANCELLED', '🚫 Seyahat iptal edildi',
                `${trip.fromPlace} → ${trip.toPlace} seyahati sahibi tarafından iptal edildi.`,
                { ...NOTIF_DATA, tripId: trip.id }).catch(() => {});
        }
        res.json({ ok: true });
    } catch (err) { next(err); }
};

export const requestJoin = async (req, res, next) => {
    try {
        const trip = await prisma.travelTrip.findUnique({ where: { id: req.params.id }, include: { requests: true } });
        if (!trip || trip.status !== 'ACTIVE') return res.status(404).json({ message: 'Seyahat bulunamadı' });
        if (trip.userId === req.userId) return res.status(400).json({ message: 'Kendi seyahatinize istek gönderemezsiniz' });
        const seats = Math.max(1, parseInt(req.body.seats, 10) || 1);
        if (seats > trip.seats - acceptedSeats(trip)) return res.status(400).json({ message: 'Yeterli boş koltuk yok' });
        const message = req.body.message ? String(req.body.message).trim().slice(0, 500) : null;

        const existing = trip.requests.find(r => r.userId === req.userId);
        if (existing && (existing.status === 'PENDING' || existing.status === 'ACCEPTED'))
            return res.status(400).json({ message: 'Zaten bir isteğiniz var' });

        const request = await prisma.travelTripRequest.upsert({
            where: { tripId_userId: { tripId: trip.id, userId: req.userId } },
            create: { tripId: trip.id, userId: req.userId, seats, message },
            update: { seats, message, status: 'PENDING' },
        });
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
        createNotification(trip.userId, 'TRAVEL_TRIP_REQUEST', '🧳 Yol arkadaşı isteği',
            `${me?.fullName || me?.username || 'Bir kullanıcı'} ${trip.fromPlace} → ${trip.toPlace} seyahatinize katılmak istiyor (${seats} kişi).`,
            { ...NOTIF_DATA, tripId: trip.id }).catch(() => {});
        res.status(201).json(request);
    } catch (err) { next(err); }
};

export const cancelMyRequest = async (req, res, next) => {
    try {
        const request = await prisma.travelTripRequest.findUnique({
            where: { tripId_userId: { tripId: req.params.id, userId: req.userId } },
            include: { trip: true },
        });
        if (!request) return res.status(404).json({ message: 'İstek bulunamadı' });
        await prisma.travelTripRequest.update({ where: { id: request.id }, data: { status: 'CANCELLED' } });
        if (request.status === 'ACCEPTED') {
            createNotification(request.trip.userId, 'TRAVEL_TRIP_REQUEST', '↩️ Yol arkadaşı ayrıldı',
                `${request.trip.fromPlace} → ${request.trip.toPlace} seyahatinizden bir yolcu ayrıldı.`,
                { ...NOTIF_DATA, tripId: request.tripId }).catch(() => {});
        }
        res.json({ ok: true });
    } catch (err) { next(err); }
};

export const respondRequest = async (req, res, next) => {
    try {
        const { action } = req.body; // ACCEPT | REJECT
        const request = await prisma.travelTripRequest.findUnique({
            where: { id: req.params.requestId },
            include: { trip: { include: { requests: true } } },
        });
        if (!request) return res.status(404).json({ message: 'İstek bulunamadı' });
        const trip = request.trip;
        if (trip.userId !== req.userId) return res.status(403).json({ message: 'Bu seyahat size ait değil' });
        if (request.status !== 'PENDING') return res.status(400).json({ message: 'Bu istek zaten yanıtlanmış' });

        if (action === 'ACCEPT') {
            if (request.seats > trip.seats - acceptedSeats(trip))
                return res.status(400).json({ message: 'Yeterli boş koltuk yok' });
            await prisma.travelTripRequest.update({ where: { id: request.id }, data: { status: 'ACCEPTED' } });
            createNotification(request.userId, 'TRAVEL_TRIP_ACCEPTED', '✅ Yol arkadaşı isteğin kabul edildi',
                `${trip.fromPlace} → ${trip.toPlace} seyahatine katılım isteğin kabul edildi. Detaylar için sohbetten yazabilirsin.`,
                { ...NOTIF_DATA, tripId: trip.id, senderId: trip.userId }).catch(() => {});
        } else {
            await prisma.travelTripRequest.update({ where: { id: request.id }, data: { status: 'REJECTED' } });
            createNotification(request.userId, 'TRAVEL_TRIP_REJECTED', '❌ Yol arkadaşı isteğin reddedildi',
                `${trip.fromPlace} → ${trip.toPlace} seyahatine katılım isteğin reddedildi.`,
                { ...NOTIF_DATA, tripId: trip.id }).catch(() => {});
        }
        res.json({ ok: true });
    } catch (err) { next(err); }
};

// ─── Admin ──────────────────────────────────────────────────────────────────

export const adminGetVerifications = async (req, res, next) => {
    try {
        const status = ['PENDING', 'APPROVED', 'REJECTED'].includes(req.query.status) ? req.query.status : 'PENDING';
        const items = await prisma.travelVerification.findMany({
            where: { status },
            include: { user: { select: { ...USER_SELECT, email: true, phone: true } } },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(items);
    } catch (err) { next(err); }
};

export const adminSetVerification = async (req, res, next) => {
    try {
        const { action, adminNote } = req.body; // APPROVE | REJECT | REVOKE
        const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const v = await prisma.travelVerification.update({
            where: { id: req.params.id },
            data: {
                status,
                adminNote: action === 'APPROVE' ? null : (adminNote || null),
                ...(action === 'APPROVE' && { approvedAt: new Date() }),
            },
        });
        const title = action === 'APPROVE' ? '✅ Yolcu doğrulamanız onaylandı' : '❌ Yolcu doğrulamanız reddedildi';
        const body = action === 'APPROVE'
            ? 'Kimlik ve adli sicil doğrulamanız onaylandı. Artık Seyahat Et bölümünde seyahat oluşturup yol arkadaşı alabilirsiniz.'
            : `Doğrulama başvurunuz reddedildi.${adminNote ? ` Neden: ${adminNote}` : ''} Bilgilerinizi düzeltip tekrar gönderebilirsiniz.`;
        createNotification(v.userId, action === 'APPROVE' ? 'TRAVEL_VERIFICATION_APPROVED' : 'TRAVEL_VERIFICATION_REJECTED',
            title, body, NOTIF_DATA).catch(() => {});
        res.json({ ok: true });
    } catch (err) { next(err); }
};
