import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { normalizePath, simplifyPath, pathLengthKm, toGpx, haversineM } from '../utils/geoPath.js';
import { runOsmImportOnce } from '../services/osmTravelImport.js';

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

// Liste ekranında binlerce noktalık path taşınmasın — detayda gelir.
const ROUTE_LIST_SELECT = {
    id: true, userId: true, title: true, startPlace: true, endPlace: true, stops: true,
    distanceKm: true, durationText: true, difficulty: true, media: true,
    ratingAvg: true, ratingCount: true, completedCount: true, createdAt: true,
    startLat: true, startLng: true, source: true, sourceUrl: true,
    user: { select: USER_SELECT },
    _count: { select: { comments: true } },
};

const hasPath = (p) => Array.isArray(p) && p.some(s => Array.isArray(s) && s.length >= 2);

const shapeListRoute = (r, from) => {
    const { _count, ...rest } = r;
    const out = { ...rest, hasGps: r.startLat != null, commentCount: _count?.comments || 0 };
    if (from && r.startLat != null) out.distanceFromMeKm = Math.round(haversineM(from, { lat: r.startLat, lng: r.startLng }) / 100) / 10;
    return out;
};

export const getRoutes = async (req, res, next) => {
    try {
        const { q, sort, mine, source, difficulty } = req.query;
        const minRating = parseFloat(req.query.minRating);
        const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
        const from = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        const where = {};
        if (mine === 'true') where.userId = req.userId;
        if (source === 'OSM' || source === 'USER') where.source = source;
        if (['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) where.difficulty = difficulty;
        if (Number.isFinite(minRating) && minRating > 0) where.ratingAvg = { gte: minRating };
        if (q && String(q).trim().length >= 2) {
            const term = String(q).trim();
            where.OR = [
                { title: { contains: term, mode: 'insensitive' } },
                { startPlace: { contains: term, mode: 'insensitive' } },
                { endPlace: { contains: term, mode: 'insensitive' } },
                { experience: { contains: term, mode: 'insensitive' } },
            ];
        }

        // Yakınlık DB'de hesaplanmıyor — rota sayısı az, başlangıç noktası olanlar JS'te sıralanır.
        if (sort === 'near') {
            if (!from) return res.status(400).json({ message: 'Konum gerekli' });
            const rows = await prisma.travelRoute.findMany({
                where: { ...where, startLat: { not: null } }, take: 1000, select: ROUTE_LIST_SELECT,
            });
            const shaped = rows.map(r => shapeListRoute(r, from)).sort((a, b) => a.distanceFromMeKm - b.distanceFromMeKm);
            return res.json(shaped.slice(0, 100));
        }

        const orderBy = sort === 'top' ? [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }]
            : sort === 'popular' ? [{ completedCount: 'desc' }, { ratingCount: 'desc' }]
            : sort === 'comments' ? [{ comments: { _count: 'desc' } }]
            : [{ createdAt: 'desc' }];
        const routes = await prisma.travelRoute.findMany({ where, orderBy, take: 100, select: ROUTE_LIST_SELECT });
        res.json(routes.map(r => shapeListRoute(r, from)));
    } catch (err) { next(err); }
};

export const getRoute = async (req, res, next) => {
    try {
        const route = await prisma.travelRoute.findUnique({
            where: { id: req.params.id },
            include: {
                user: { select: USER_SELECT },
                reviews: { include: { user: { select: USER_SELECT } }, orderBy: { createdAt: 'desc' } },
                comments: { include: { user: { select: USER_SELECT } }, orderBy: { createdAt: 'desc' }, take: 200 },
            },
        });
        if (!route) return res.status(404).json({ message: 'Rota bulunamadı' });
        const myLists = await prisma.travelRouteListItem.findMany({
            where: { routeId: route.id, list: { userId: req.userId } },
            select: { listId: true, list: { select: { kind: true } } },
        });
        res.json({
            ...route,
            myRating: route.reviews.find(r => r.userId === req.userId)?.rating || 0,
            myListIds: myLists.map(i => i.listId),
            completedByMe: myLists.some(i => i.list.kind === 'COMPLETED'),
            canDelete: route.userId === req.userId && route.source !== 'OSM',
        });
    } catch (err) { next(err); }
};

export const createRoute = async (req, res, next) => {
    try {
        const { title, startPlace, endPlace, stops, distanceKm, durationText, difficulty, experience, media } = req.body;
        if (!String(title || '').trim() || !String(startPlace || '').trim())
            return res.status(400).json({ message: 'Rota adı ve başlangıç noktası zorunludur' });
        let dist = distanceKm != null && distanceKm !== '' ? parseFloat(distanceKm) : null;
        const segs = simplifyPath(normalizePath(req.body.path));
        const gps = hasPath(segs)
            ? { path: segs, startLat: segs[0][0].lat, startLng: segs[0][0].lng }
            : {};
        if (!(Number.isFinite(dist) && dist > 0) && gps.path) dist = pathLengthKm(segs);
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
                ...gps,
            },
            include: { user: { select: USER_SELECT } },
        });
        res.status(201).json(route);
    } catch (err) { next(err); }
};

// Herkese açık: saat uygulamaları (Huawei Health, Garmin, Komoot) GPX'i URL'den içe aktarır.
export const getRouteGpx = async (req, res, next) => {
    try {
        const route = await prisma.travelRoute.findUnique({
            where: { id: req.params.id }, select: { title: true, path: true },
        });
        if (!route || !hasPath(route.path)) return res.status(404).json({ message: 'Rota GPS verisi yok' });
        const safe = route.title.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'route';
        res.setHeader('Content-Type', 'application/gpx+xml; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safe)}.gpx"; filename*=UTF-8''${encodeURIComponent(safe)}.gpx`);
        res.send(toGpx(route.title, route.path));
    } catch (err) { next(err); }
};

export const adminImportOsmRoutes = async (req, res, next) => {
    try {
        runOsmImportOnce().then(r => console.log('[osmTravel] admin içe aktarma:', r)).catch(e => console.error('[osmTravel]', e.message));
        res.json({ ok: true, started: true });
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
        // Hazır rotalar admin hesabına bağlı — kimse (admin dahil) uygulamadan silemesin.
        if (route.source === 'OSM') return res.status(403).json({ message: 'Hazır rotalar silinemez' });
        if (route.userId !== req.userId) return res.status(403).json({ message: 'Sadece kendi rotanızı silebilirsiniz' });
        await prisma.travelRoute.delete({ where: { id: route.id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};

// ─── Yorumlar (puandan ayrı) ────────────────────────────────────────────────

export const addComment = async (req, res, next) => {
    try {
        const text = String(req.body.text || '').trim().slice(0, 2000);
        if (!text) return res.status(400).json({ message: 'Yorum boş olamaz' });
        const route = await prisma.travelRoute.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true, title: true } });
        if (!route) return res.status(404).json({ message: 'Rota bulunamadı' });
        const comment = await prisma.travelRouteComment.create({
            data: { routeId: route.id, userId: req.userId, text },
            include: { user: { select: USER_SELECT } },
        });
        if (route.userId !== req.userId) {
            createNotification(route.userId, 'TRAVEL_ROUTE_COMMENT', '💬 Rotanıza yorum geldi',
                `"${route.title}": ${text.slice(0, 80)}`, { ...NOTIF_DATA, routeId: route.id }).catch(() => {});
        }
        res.status(201).json(comment);
    } catch (err) { next(err); }
};

export const deleteComment = async (req, res, next) => {
    try {
        const c = await prisma.travelRouteComment.findUnique({ where: { id: req.params.id } });
        if (!c) return res.status(404).json({ message: 'Yorum bulunamadı' });
        if (c.userId !== req.userId) return res.status(403).json({ message: 'Sadece kendi yorumunuzu silebilirsiniz' });
        await prisma.travelRouteComment.delete({ where: { id: c.id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};

// ─── Rota listeleri ─────────────────────────────────────────────────────────

const DEFAULT_LIST_KINDS = ['COMPLETED', 'WISHLIST', 'FAVORITES'];
const LIST_KIND_ORDER = { COMPLETED: 0, WISHLIST: 1, FAVORITES: 2, CUSTOM: 3 };

async function ensureDefaultLists(userId) {
    const have = await prisma.travelRouteList.findMany({ where: { userId, kind: { in: DEFAULT_LIST_KINDS } }, select: { kind: true } });
    const missing = DEFAULT_LIST_KINDS.filter(k => !have.some(h => h.kind === k));
    if (missing.length) await prisma.travelRouteList.createMany({ data: missing.map(kind => ({ userId, kind })) });
}

async function ownList(id, userId) {
    const list = await prisma.travelRouteList.findUnique({ where: { id } });
    return list && list.userId === userId ? list : null;
}

export const getLists = async (req, res, next) => {
    try {
        await ensureDefaultLists(req.userId);
        const routeId = req.query.routeId ? String(req.query.routeId) : null;
        const lists = await prisma.travelRouteList.findMany({
            where: { userId: req.userId },
            include: {
                _count: { select: { items: true } },
                ...(routeId ? { items: { where: { routeId }, select: { id: true } } } : {}),
            },
            orderBy: { createdAt: 'asc' },
        });
        res.json(lists
            .map(({ _count, items, ...l }) => ({ ...l, itemCount: _count.items, ...(routeId ? { hasRoute: items.length > 0 } : {}) }))
            .sort((a, b) => LIST_KIND_ORDER[a.kind] - LIST_KIND_ORDER[b.kind]));
    } catch (err) { next(err); }
};

export const createList = async (req, res, next) => {
    try {
        const name = String(req.body.name || '').trim().slice(0, 60);
        if (!name) return res.status(400).json({ message: 'Liste adı zorunludur' });
        const count = await prisma.travelRouteList.count({ where: { userId: req.userId } });
        if (count >= 50) return res.status(400).json({ message: 'En fazla 50 liste oluşturabilirsiniz' });
        const list = await prisma.travelRouteList.create({ data: { userId: req.userId, kind: 'CUSTOM', name } });
        res.status(201).json({ ...list, itemCount: 0 });
    } catch (err) { next(err); }
};

export const renameList = async (req, res, next) => {
    try {
        const list = await ownList(req.params.id, req.userId);
        if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });
        if (list.kind !== 'CUSTOM') return res.status(400).json({ message: 'Varsayılan listelerin adı değiştirilemez' });
        const name = String(req.body.name || '').trim().slice(0, 60);
        if (!name) return res.status(400).json({ message: 'Liste adı zorunludur' });
        res.json(await prisma.travelRouteList.update({ where: { id: list.id }, data: { name } }));
    } catch (err) { next(err); }
};

export const deleteList = async (req, res, next) => {
    try {
        const list = await ownList(req.params.id, req.userId);
        if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });
        if (list.kind !== 'CUSTOM') return res.status(400).json({ message: 'Varsayılan listeler silinemez' });
        await prisma.travelRouteList.delete({ where: { id: list.id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};

export const getList = async (req, res, next) => {
    try {
        const list = await ownList(req.params.id, req.userId);
        if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });
        const items = await prisma.travelRouteListItem.findMany({
            where: { listId: list.id },
            orderBy: { createdAt: 'desc' },
            include: { route: { select: ROUTE_LIST_SELECT } },
        });
        res.json({ ...list, routes: items.map(i => ({ ...shapeListRoute(i.route), addedAt: i.createdAt })) });
    } catch (err) { next(err); }
};

export const addListItem = async (req, res, next) => {
    try {
        const list = await ownList(req.params.id, req.userId);
        if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });
        const routeId = String(req.body.routeId || '');
        const route = await prisma.travelRoute.findUnique({ where: { id: routeId }, select: { id: true } });
        if (!route) return res.status(404).json({ message: 'Rota bulunamadı' });
        const exists = await prisma.travelRouteListItem.findUnique({ where: { listId_routeId: { listId: list.id, routeId } } });
        if (!exists) {
            await prisma.travelRouteListItem.create({ data: { listId: list.id, routeId } });
            if (list.kind === 'COMPLETED') await prisma.travelRoute.update({ where: { id: routeId }, data: { completedCount: { increment: 1 } } });
        }
        res.json({ ok: true });
    } catch (err) { next(err); }
};

export const removeListItem = async (req, res, next) => {
    try {
        const list = await ownList(req.params.id, req.userId);
        if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });
        const { count } = await prisma.travelRouteListItem.deleteMany({ where: { listId: list.id, routeId: req.params.routeId } });
        if (count && list.kind === 'COMPLETED') {
            await prisma.travelRoute.updateMany({ where: { id: req.params.routeId, completedCount: { gt: 0 } }, data: { completedCount: { decrement: 1 } } });
        }
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
        // Hazır rotaların sahibi admin — her puan için admin'e bildirim gitmesin.
        if (route.source !== 'OSM') {
            createNotification(route.userId, 'TRAVEL_ROUTE_REVIEW', '⭐ Rotanız değerlendirildi',
                `"${route.title}" rotanıza ${rating} yıldız verildi${comment ? `: ${comment.slice(0, 80)}` : ''}`,
                { ...NOTIF_DATA, routeId: route.id }).catch(() => {});
        }
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
