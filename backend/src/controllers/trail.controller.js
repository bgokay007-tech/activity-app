import prisma from '../config/prisma.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

// Listeler için ilan sahibi + ortalama puan/yorum sayısı bilgisiyle birlikte döner.
export const getTrails = async (req, res, next) => {
    try {
        const { subCategory = 'hiking', city, difficulty, minDistance, maxDistance } = req.query;
        const where = {
            subCategory,
            ...(city && { city: { contains: city, mode: 'insensitive' } }),
            ...(difficulty && { difficulty }),
            ...((minDistance || maxDistance) && {
                distanceKm: {
                    ...(minDistance && { gte: parseFloat(minDistance) }),
                    ...(maxDistance && { lte: parseFloat(maxDistance) }),
                },
            }),
        };
        const trails = await prisma.trail.findMany({
            where,
            select: {
                id: true, title: true, description: true, city: true, district: true,
                distanceKm: true, elevationGain: true, durationMin: true, difficulty: true,
                images: true, source: true, verified: true, createdAt: true, startLat: true, startLng: true,
                creator: { select: USER_SELECT },
                _count: { select: { reviews: true, comments: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 60,
        });

        const trailIds = trails.map(t => t.id);
        const ratings = trailIds.length ? await prisma.trailReview.groupBy({
            by: ['trailId'],
            where: { trailId: { in: trailIds } },
            _avg: { rating: true },
        }) : [];
        const ratingMap = Object.fromEntries(ratings.map(r => [r.trailId, r._avg.rating]));

        res.json(trails.map(t => ({
            ...t,
            avgRating: ratingMap[t.id] || null,
            reviewCount: t._count.reviews,
            commentCount: t._count.comments,
            _count: undefined,
        })));
    } catch (error) { next(error); }
};

export const getTrailById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [trail, agg] = await Promise.all([
            prisma.trail.findUnique({
                where: { id },
                include: {
                    creator: { select: USER_SELECT },
                    comments: { orderBy: { createdAt: 'asc' }, include: { user: { select: USER_SELECT } } },
                },
            }),
            prisma.trailReview.aggregate({ where: { trailId: id }, _avg: { rating: true }, _count: { id: true } }),
        ]);
        if (!trail) return res.status(404).json({ message: 'Rota bulunamadı' });
        res.json({ ...trail, avgRating: agg._avg.rating, reviewCount: agg._count.id });
    } catch (error) { next(error); }
};

export const createTrail = async (req, res, next) => {
    try {
        const {
            subCategory = 'hiking', title, description, city, district,
            distanceKm, elevationGain, durationMin, difficulty, path,
            startLat, startLng, images, source,
        } = req.body;

        if (!title || !Array.isArray(path) || path.length < 2) {
            return res.status(400).json({ message: 'Başlık ve en az 2 noktalı bir güzergah gerekli' });
        }

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        // Sadece admin "CURATED" (onaylı) rota işaretleyebilir — normal kullanıcı isteği
        // sessizce USER'a düşürülür, sahte "Onaylı" rozeti oluşturulamaz.
        const isCurated = !!me?.isAdmin && source === 'CURATED';

        const trail = await prisma.trail.create({
            data: {
                creatorId: req.userId,
                subCategory,
                title,
                description: description || null,
                city: city || null,
                district: district || null,
                distanceKm: parseFloat(distanceKm) || 0,
                elevationGain: elevationGain !== undefined && elevationGain !== null && elevationGain !== '' ? parseFloat(elevationGain) : null,
                durationMin: durationMin !== undefined && durationMin !== null && durationMin !== '' ? parseInt(durationMin, 10) : null,
                difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) ? difficulty : 'MEDIUM',
                path,
                startLat: startLat !== undefined ? Number(startLat) : (path[0]?.lat ?? null),
                startLng: startLng !== undefined ? Number(startLng) : (path[0]?.lng ?? null),
                images: Array.isArray(images) ? images : [],
                source: isCurated ? 'CURATED' : 'USER',
                verified: isCurated,
            },
            include: { creator: { select: USER_SELECT } },
        });
        res.status(201).json(trail);
    } catch (error) { next(error); }
};

export const updateTrail = async (req, res, next) => {
    try {
        const { id } = req.params;
        const trail = await prisma.trail.findUnique({ where: { id } });
        if (!trail) return res.status(404).json({ message: 'Rota bulunamadı' });
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        if (trail.creatorId !== req.userId && !me?.isAdmin) return res.status(403).json({ message: 'Forbidden' });

        const { title, description, city, district, distanceKm, elevationGain, durationMin, difficulty, images } = req.body;
        const updated = await prisma.trail.update({
            where: { id },
            data: {
                ...(title !== undefined && { title }),
                ...(description !== undefined && { description: description || null }),
                ...(city !== undefined && { city: city || null }),
                ...(district !== undefined && { district: district || null }),
                ...(distanceKm !== undefined && { distanceKm: parseFloat(distanceKm) || 0 }),
                ...(elevationGain !== undefined && { elevationGain: elevationGain !== '' ? parseFloat(elevationGain) : null }),
                ...(durationMin !== undefined && { durationMin: durationMin !== '' ? parseInt(durationMin, 10) : null }),
                ...(difficulty !== undefined && ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) && { difficulty }),
                ...(images !== undefined && Array.isArray(images) && { images }),
            },
        });
        res.json(updated);
    } catch (error) { next(error); }
};

export const deleteTrail = async (req, res, next) => {
    try {
        const { id } = req.params;
        const trail = await prisma.trail.findUnique({ where: { id } });
        if (!trail) return res.status(404).json({ message: 'Rota bulunamadı' });
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        if (trail.creatorId !== req.userId && !me?.isAdmin) return res.status(403).json({ message: 'Forbidden' });
        await prisma.trail.delete({ where: { id } });
        res.json({ message: 'Silindi' });
    } catch (error) { next(error); }
};

export const upsertTrailReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'Puan 1-5 arasında olmalı' });
        await prisma.trailReview.upsert({
            where: { userId_trailId: { userId: req.userId, trailId: id } },
            update: { rating, comment: comment || null },
            create: { trailId: id, userId: req.userId, rating, comment: comment || null },
        });
        const agg = await prisma.trailReview.aggregate({ where: { trailId: id }, _avg: { rating: true }, _count: { id: true } });
        res.json({ avgRating: agg._avg.rating, reviewCount: agg._count.id });
    } catch (error) { next(error); }
};

export const addTrailComment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        if (!content?.trim()) return res.status(400).json({ message: 'Yorum boş olamaz' });
        const comment = await prisma.trailComment.create({
            data: { trailId: id, userId: req.userId, content: content.trim() },
            include: { user: { select: USER_SELECT } },
        });
        res.status(201).json(comment);
    } catch (error) { next(error); }
};
