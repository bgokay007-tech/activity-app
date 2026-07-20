import prisma from '../config/prisma.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

export const getListings = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;
        const listings = await prisma.refereeListing.findMany({
            where: {
                status: 'ACTIVE',
                category: category || undefined,
                subCategory: subCategory || undefined,
            },
            include: { user: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        const listingIds = listings.map(l => l.id);
        const ratings = listingIds.length ? await prisma.refereeReview.groupBy({
            by: ['refereeListingId'],
            where: { refereeListingId: { in: listingIds } },
            _avg: { rating: true },
            _count: { id: true },
        }) : [];
        const ratingMap = Object.fromEntries(ratings.map(r => [r.refereeListingId, { avg: r._avg.rating, count: r._count.id }]));
        res.json(listings.map(l => ({
            ...l,
            avgRating: ratingMap[l.id]?.avg ?? null,
            reviewCount: ratingMap[l.id]?.count ?? 0,
        })));
    } catch (err) { next(err); }
};

// Bu hakeme yorum/puan verme yetkisi: sadece bu kişinin gerçekten hakemlik yaptığı
// bir maçta sahip/katılımcı olanlar verebilir (ActivityRequest.refereeId üzerinden).
async function canReviewReferee(refereeUserId, reviewerId) {
    if (refereeUserId === reviewerId) return false;
    // participants/senderTeam obje dizisi içeren Json alanlar — Prisma'nın array_contains'i
    // tam obje eşleşmesi arar (id dışındaki alanlar farklı olduğu için işe yaramaz), bu yüzden
    // sadece refereeId ile filtreleyip üyeliği JS tarafında kontrol ediyoruz.
    const matches = await prisma.activityRequest.findMany({
        where: { refereeId: refereeUserId },
        select: { senderId: true, participants: true, senderTeam: true },
    });
    return matches.some(m =>
        m.senderId === reviewerId ||
        (Array.isArray(m.participants) && m.participants.some(p => p?.id === reviewerId)) ||
        (Array.isArray(m.senderTeam) && m.senderTeam.some(p => p?.id === reviewerId))
    );
}

export const getReviews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.refereeListing.findUnique({ where: { id }, select: { userId: true } });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        const reviews = await prisma.refereeReview.findMany({
            where: { refereeListingId: id },
            include: { reviewer: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        const eligible = req.userId ? await canReviewReferee(listing.userId, req.userId) : false;
        res.json({
            reviews,
            avgRating: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null,
            canReview: eligible,
        });
    } catch (err) { next(err); }
};

export const submitReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const r = parseInt(rating, 10);
        if (!r || r < 1 || r > 5) return res.status(400).json({ message: 'Geçerli bir yıldız puanı girin (1-5)' });

        const listing = await prisma.refereeListing.findUnique({ where: { id }, select: { userId: true } });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });

        const eligible = await canReviewReferee(listing.userId, req.userId);
        if (!eligible) return res.status(403).json({ message: 'Bu hakemin yönettiği bir maçta yer almadığınız için yorum/puan veremezsiniz' });

        const review = await prisma.refereeReview.upsert({
            where: { refereeListingId_reviewerId: { refereeListingId: id, reviewerId: req.userId } },
            update: { rating: r, comment: comment || null },
            create: { refereeListingId: id, reviewerId: req.userId, rating: r, comment: comment || null },
            include: { reviewer: { select: USER_SELECT } },
        });
        res.status(201).json(review);
    } catch (err) { next(err); }
};

export const createListing = async (req, res, next) => {
    try {
        const {
            category, subCategory,
            credentialLevel, certName, certificateUrl, experience,
            achievements, achievementUrls, cvUrl,
            pricePerMatch,
            location, city, days, timeFrom, timeTo, description,
        } = req.body;

        if (!credentialLevel || !location || !category || !subCategory)
            return res.status(400).json({ message: 'Missing required fields' });

        const listing = await prisma.refereeListing.create({
            data: {
                userId: req.userId,
                category, subCategory,
                credentialLevel, certName, certificateUrl,
                experience: Number(experience) || 0,
                achievements, achievementUrls: achievementUrls || [], cvUrl,
                pricePerMatch: Number(pricePerMatch) || 0,
                location, city,
                days: days || [],
                timeFrom: timeFrom || '09:00',
                timeTo: timeTo || '21:00',
                description,
            },
            include: { user: { select: USER_SELECT } },
        });
        res.status(201).json(listing);

        // Notify city-alert subscribers for referees tab (async, non-blocking)
        notifyCitySubscribers({
            subCategory: listing.subCategory,
            category: listing.category,
            senderCity: listing.city || null,
            senderUsername: listing.user?.username || '',
            senderId: req.userId,
            itemId: listing.id,
            tab: 'referees',
        });
        notifyActivityAlertSubscribers({
            subCategory: listing.subCategory,
            category: listing.category,
            senderCity: listing.city || null,
            senderUsername: listing.user?.username || '',
            senderId: req.userId,
            itemId: listing.id,
            tab: 'referees',
        });
    } catch (err) { next(err); }
};

export const updateListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.refereeListing.findUnique({ where: { id } });
        if (!listing || listing.userId !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });

        const {
            credentialLevel, certName, certificateUrl, experience,
            achievements, achievementUrls, cvUrl,
            pricePerMatch,
            location, city, days, timeFrom, timeTo, description,
        } = req.body;

        const updated = await prisma.refereeListing.update({
            where: { id },
            data: {
                ...(credentialLevel !== undefined && { credentialLevel }),
                ...(certName !== undefined && { certName }),
                ...(certificateUrl !== undefined && { certificateUrl }),
                ...(experience !== undefined && { experience: Number(experience) || 0 }),
                ...(achievements !== undefined && { achievements }),
                ...(achievementUrls !== undefined && { achievementUrls }),
                ...(cvUrl !== undefined && { cvUrl }),
                ...(pricePerMatch !== undefined && { pricePerMatch: Number(pricePerMatch) || 0 }),
                ...(location !== undefined && { location }),
                ...(city !== undefined && { city }),
                ...(days !== undefined && { days }),
                ...(timeFrom !== undefined && { timeFrom }),
                ...(timeTo !== undefined && { timeTo }),
                ...(description !== undefined && { description }),
            },
            include: { user: { select: USER_SELECT } },
        });
        res.json(updated);
    } catch (err) { next(err); }
};

export const deleteListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.refereeListing.findUnique({ where: { id } });
        if (!listing || listing.userId !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });
        await prisma.refereeListing.delete({ where: { id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};
