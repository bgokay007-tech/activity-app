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
        const { city, name, sport, surface, indoor } = req.query;

        const courts = await prisma.court.findMany({
            where: {
                ...(name ? { name: { contains: name, mode: 'insensitive' } } : {}),
                ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
                sport: sport || undefined,
                surface: surface || undefined,
                indoor: indoor === 'true' ? true : indoor === 'false' ? false : undefined,
            },
            include: {
                user: {
                    select: { id: true, username: true },
                },
            },
            orderBy: [
                { verified: 'desc' },
                { createdAt: 'desc' },
            ],
        });

        res.json(courts);
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