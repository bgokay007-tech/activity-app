import prisma from '../config/prisma.js';

export const addCourt = async (req, res, next) => {
    try {
        const { name, address, city, country, lat, lng, sport, surface, indoor, fee, feeAmount, lights, description } = req.body;

        const court = await prisma.court.create({
            data: {
                name,
                address,
                city,
                country,
                lat: lat ? Number(lat) : null,
                lng: lng ? Number(lng) : null,
                sport: sport || 'tennis',
                surface,
                indoor: indoor || false,
                fee: fee || false,
                feeAmount: feeAmount || null,
                lights: lights || false,
                description,
                addedBy: req.userId,
            },
            include: {
                user: {
                    select: { id: true, username: true, fullName: true },
                },
            },
        });

        res.status(201).json(court);
    } catch (error) {
        next(error);
    }
};

export const getAllCourts = async (req, res, next) => {
    try {
        const { sport, city, page = 1, limit = 20 } = req.query;
        const courts = await prisma.court.findMany({
            where: {
                ...(sport && { sport }),
                ...(city  && { city: { contains: city, mode: 'insensitive' } }),
            },
            include: { user: { select: { id: true, username: true } } },
            orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
        });
        const total = await prisma.court.count({
            where: {
                ...(sport && { sport }),
                ...(city  && { city: { contains: city, mode: 'insensitive' } }),
            },
        });
        res.json({ courts, total });
    } catch (error) { next(error); }
};

export const searchCourts = async (req, res, next) => {
    try {
        const { city, sport, surface, indoor } = req.query;
        const name = req.query.name || req.query.q;

        const courtWhere = {
            ...(name ? { name: { contains: name, mode: 'insensitive' } } : {}),
            ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
            sport: sport || undefined,
            surface: surface || undefined,
            indoor: indoor === 'true' ? true : indoor === 'false' ? false : undefined,
        };

        const [courts, venues] = await Promise.all([
            prisma.court.findMany({
                where: courtWhere,
                include: { user: { select: { id: true, username: true } } },
                orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
            }),
            prisma.businessVenue.findMany({
                where: {
                    status: 'APPROVED',
                    ...(sport ? { branch: { equals: sport, mode: 'insensitive' } } : {}),
                    ...(name
                        ? {
                            OR: [
                                { name:   { contains: name, mode: 'insensitive' } },
                                { courts: { some: { name: { contains: name, mode: 'insensitive' } } } },
                            ],
                          }
                        : {}),
                    ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
                },
                include: {
                    courts: true,
                    user: { select: { id: true, username: true, businessName: true, businessIban: true, businessIbanHolder: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        // Kort rating ortalamaları
        const courtIds = courts.map(c => c.id);
        const courtRatings = courtIds.length ? await prisma.courtRating.groupBy({
            by: ['courtId'],
            where: { courtId: { in: courtIds } },
            _avg: { rating: true },
            _count: { id: true },
        }) : [];
        const courtRatingMap = Object.fromEntries(courtRatings.map(r => [r.courtId, { avg: r._avg.rating, count: r._count.id }]));

        // Tesis rating ortalamaları
        const venueIds = venues.map(v => v.id);
        const venueRatings = venueIds.length ? await prisma.venueReview.groupBy({
            by: ['venueId'],
            where: { venueId: { in: venueIds }, courtId: null },
            _avg: { rating: true },
            _count: { id: true },
        }) : [];
        const venueRatingMap = Object.fromEntries(venueRatings.map(r => [r.venueId, { avg: r._avg.rating, count: r._count.id }]));

        // Onaylı bir BusinessVenue ile aynı/çakışan community Court kayıtlarını gizle.
        // Bunlar genelde tesis düzgün kaydedilmeden önce eklenmiş eski/yinelenen kayıtlardır —
        // seçilirse gerçek rezervasyon sistemine (VenueCourt) bağlanmadığı için işletmenin
        // takvimi hiç bloklanmaz ("Büro Kort1" gibi hayalet kort sorunu).
        const normalize = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
        const stripTrailingNumber = (s) => normalize(s).replace(/[\s-]*\d+$/, '').trim();
        const venueNameSet = new Set();
        for (const v of venues) {
            venueNameSet.add(normalize(v.name));
            venueNameSet.add(stripTrailingNumber(v.name));
        }
        const courts_ = courts.filter(c =>
            !venueNameSet.has(normalize(c.name)) && !venueNameSet.has(stripTrailingNumber(c.name))
        );

        const courtsWithRating = courts_.map(c => ({
            ...c,
            avgRating:   courtRatingMap[c.id]?.avg   ?? null,
            reviewCount: courtRatingMap[c.id]?.count  ?? 0,
        }));

        // Her BusinessVenue tek satır olarak döner (kort bazlı değil tesis bazlı)
        const venueAsCourts = venues.map(v => ({
            id: `venue_${v.id}`,
            name: v.name,
            address: v.address || null,
            city: v.city,
            sport: v.branch,
            courtCount: v.courts.length,
            isBusinessVenue: true,
            venueId: v.id,
            user: v.user,
            avgRating:   venueRatingMap[v.id]?.avg   ?? null,
            reviewCount: venueRatingMap[v.id]?.count  ?? 0,
        }));

        res.json([...courtsWithRating, ...venueAsCourts]);
    } catch (error) {
        next(error);
    }
};

export const getCourt = async (req, res, next) => {
    try {
        const { id } = req.params;

        const court = await prisma.court.findUnique({
            where: { id },
            include: {
                user: {
                    select: { id: true, username: true, fullName: true },
                },
            },
        });

        if (!court) {
            return res.status(404).json({ message: 'Court not found' });
        }

        res.json(court);
    } catch (error) {
        next(error);
    }
};

export const updateCourt = async (req, res, next) => {
    try {
        const { id } = req.params;

        const court = await prisma.court.findUnique({ where: { id } });

        if (!court || court.addedBy !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const updated = await prisma.court.update({
            where: { id },
            data: req.body,
        });

        res.json(updated);
    } catch (error) {
        next(error);
    }
};

export const deleteCourt = async (req, res, next) => {
    try {
        const { id } = req.params;

        const court = await prisma.court.findUnique({ where: { id } });

        if (!court || court.addedBy !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        await prisma.court.delete({ where: { id } });

        res.json({ message: 'Court deleted' });
    } catch (error) {
        next(error);
    }
};

export const getPendingCourts = async (req, res, next) => {
    try {
        const courts = await prisma.court.findMany({
            where: { pending: true, verified: false },
            include: { user: { select: { id: true, username: true, fullName: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(courts);
    } catch (error) { next(error); }
};

export const verifyCourt = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, address, city, sport, surface } = req.body; // admin can correct fields before approving
        const court = await prisma.court.update({
            where: { id },
            data: {
                verified: true,
                pending: false,
                ...(name    && { name }),
                ...(address && { address }),
                ...(city    && { city }),
                ...(sport   && { sport }),
                ...(surface && { surface }),
            },
        });
        res.json(court);
    } catch (error) { next(error); }
};

export const rejectCourt = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const court = await prisma.court.update({
            where: { id },
            data: { pending: false, verified: false, rejectedReason: reason || 'Rejected by admin' },
        });
        res.json(court);
    } catch (error) { next(error); }
};

export const importFromOSM = async (req, res, next) => {
    try {
        const { city, sport = 'tennis' } = req.body;

        // Türkçe İ karakteri ile Latin I arasındaki farkı kapsa
        const cityRegex = city.replace(/İ/g, '[İI]').replace(/ı/g, '[ıi]').replace(/I/g, '[İI]').replace(/i/g, '[ıi]');
        const query = `[out:json][timeout:60];(area["name"~"${cityRegex}"]->.a;area["name:en"~"${city}",i]->.a;);(node["sport"="${sport}"](area.a);way["sport"="${sport}"](area.a););out body;>;out skel qt;`;

        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'AcTiViTy-App/1.0',
            },
            body: new URLSearchParams({ data: query }).toString(),
        });

        const text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            return res.status(500).json({ message: 'Overpass API error', raw: text.slice(0, 300) });
        }

        if (!data.elements || data.elements.length === 0) {
            return res.json({ message: '0 courts imported', total: 0, imported: 0 });
        }

        const courts = data.elements
            .filter(el => el.tags && (el.tags.name || el.tags['name:en']))
            .map(el => ({
                name: el.tags.name || el.tags['name:en'],
                address: [el.tags['addr:street'], el.tags['addr:housenumber']].filter(Boolean).join(' ') || null,
                city,
                country: el.tags['addr:country'] || null,
                lat: el.lat || el.center?.lat || null,
                lng: el.lon || el.center?.lon || null,
                sport,
                surface: el.tags.surface || null,
                indoor: el.tags.indoor === 'yes',
                fee: el.tags.fee === 'yes',
                lights: el.tags.lit === 'yes',
                addedBy: req.userId,
                verified: false,
            }));

        let imported = 0;
        for (const court of courts) {
            const existing = await prisma.court.findFirst({
                where: { name: court.name, city },
            });
            if (!existing) {
                await prisma.court.create({ data: court });
                imported++;
            }
        }

        res.json({
            message: `${imported} courts imported from OpenStreetMap`,
            total: courts.length,
            imported,
        });
    } catch (error) {
        next(error);
    }
};
export const getCourtRatings = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [ratings, agg] = await Promise.all([
            prisma.courtRating.findMany({
                where: { courtId: id },
                include: { user: { select: { id: true, username: true, avatar: true } } },
                orderBy: { createdAt: 'desc' },
                take: 30,
            }),
            prisma.courtRating.aggregate({
                where: { courtId: id },
                _avg: { rating: true },
                _count: { id: true },
            }),
        ]);
        res.json({
            reviews: ratings,
            venueRating: agg._avg.rating,
            venueReviewCount: agg._count.id,
        });
    } catch (error) { next(error); }
};

export const upsertCourtRating = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const { rating, comment } = req.body;
        await prisma.courtRating.upsert({
            where: { userId_courtId: { userId, courtId: id } },
            update: { rating, comment: comment || null },
            create: { courtId: id, userId, rating, comment: comment || null },
        });
        res.json({ ok: true });
    } catch (error) { next(error); }
};
