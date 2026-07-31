import prisma from '../config/prisma.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };
const VALID_TYPES = ['DJ', 'BAND', 'SOLO_MUSICIAN', 'DANCER', 'OTHER'];

// Sanatçılar sekmesi — herkese açık, aktif profiller
export const getListings = async (req, res, next) => {
    try {
        const { city, artistType } = req.query;
        const listings = await prisma.artistListing.findMany({
            where: {
                status: 'ACTIVE',
                city: city || undefined,
                artistType: artistType || undefined,
            },
            include: { user: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(listings);
    } catch (err) { next(err); }
};

export const getListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.artistListing.findUnique({
            where: { id },
            include: { user: { select: USER_SELECT } },
        });
        if (!listing) return res.status(404).json({ message: 'Sanatçı profili bulunamadı' });
        res.json(listing);
    } catch (err) { next(err); }
};

// Kendi profilim — düzenleme formunu doldurmak için (yoksa null döner)
export const getMyListing = async (req, res, next) => {
    try {
        const listing = await prisma.artistListing.findUnique({
            where: { userId: req.userId },
            include: { user: { select: USER_SELECT } },
        });
        res.json(listing);
    } catch (err) { next(err); }
};

// Kullanıcı başına tek profil — upsert (yoksa oluşturur, varsa günceller)
export const upsertMyListing = async (req, res, next) => {
    try {
        const { artistType, stageName, genres, description, pricePerEvent, portfolioUrl1, portfolioUrl2, city } = req.body;
        if (!artistType || !VALID_TYPES.includes(artistType))
            return res.status(400).json({ message: 'Geçersiz sanatçı türü' });

        const data = {
            artistType,
            stageName: stageName?.trim() || null,
            genres: genres?.trim() || null,
            description: description?.trim() || null,
            pricePerEvent: pricePerEvent !== undefined && pricePerEvent !== '' ? parseInt(pricePerEvent) || 0 : null,
            portfolioUrl1: portfolioUrl1?.trim() || null,
            portfolioUrl2: portfolioUrl2?.trim() || null,
            city: city?.trim() || null,
            status: 'ACTIVE',
        };

        const listing = await prisma.artistListing.upsert({
            where: { userId: req.userId },
            create: { userId: req.userId, ...data },
            update: data,
            include: { user: { select: USER_SELECT } },
        });
        res.status(201).json(listing);
    } catch (err) { next(err); }
};

export const deleteMyListing = async (req, res, next) => {
    try {
        const listing = await prisma.artistListing.findUnique({ where: { userId: req.userId } });
        if (!listing) return res.status(404).json({ message: 'Profil bulunamadı' });
        await prisma.artistListing.delete({ where: { userId: req.userId } });
        res.json({ message: 'Silindi' });
    } catch (err) { next(err); }
};
