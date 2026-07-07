import prisma from '../config/prisma.js';

const reviewInclude = {
    user: { select: { id: true, username: true, fullName: true, avatar: true } },
    court: { select: { id: true, name: true } },
};

// GET /venues/:id/reviews — tesis + tüm kortların yorumları
export const getVenueReviews = async (req, res, next) => {
    try {
        const reviews = await prisma.venueReview.findMany({
            where: { venueId: req.params.id },
            include: reviewInclude,
            orderBy: { createdAt: 'desc' },
        });

        // Aggregate: tesis geneli
        const venueReviews = reviews.filter(r => !r.courtId);
        const venueRating  = venueReviews.length
            ? +(venueReviews.reduce((s, r) => s + r.rating, 0) / venueReviews.length).toFixed(1)
            : null;

        // Aggregate: kort bazında
        const courtMap = {};
        reviews.filter(r => r.courtId).forEach(r => {
            if (!courtMap[r.courtId]) courtMap[r.courtId] = { courtId: r.courtId, courtName: r.court?.name, ratings: [] };
            courtMap[r.courtId].ratings.push(r.rating);
        });
        const courtRatings = Object.values(courtMap).map(c => ({
            courtId:    c.courtId,
            courtName:  c.courtName,
            avgRating:  +(c.ratings.reduce((s, v) => s + v, 0) / c.ratings.length).toFixed(1),
            count:      c.ratings.length,
        }));

        res.json({ reviews, venueRating, venueReviewCount: venueReviews.length, courtRatings, _myId: req.userId });
    } catch (e) { next(e); }
};

// POST /venues/:id/reviews — tesis yorumu oluştur/güncelle
export const upsertVenueReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        if (!rating || rating < 1 || rating > 5)
            return res.status(400).json({ message: 'Puan 1-5 arasında olmalıdır' });

        const venue = await prisma.businessVenue.findUnique({ where: { id, status: 'APPROVED' } });
        if (!venue) return res.status(404).json({ message: 'Tesis bulunamadı' });

        const review = await prisma.venueReview.upsert({
            where:  { userId_venueId_courtId: { userId: req.userId, venueId: id, courtId: null } },
            create: { venueId: id, courtId: null, userId: req.userId, rating, comment: comment?.trim() || null },
            update: { rating, comment: comment?.trim() || null },
            include: reviewInclude,
        });
        res.json({ review });
    } catch (e) { next(e); }
};

// POST /venues/:id/courts/:courtId/reviews — kort yorumu oluştur/güncelle
export const upsertCourtReview = async (req, res, next) => {
    try {
        const { id, courtId } = req.params;
        const { rating, comment } = req.body;
        if (!rating || rating < 1 || rating > 5)
            return res.status(400).json({ message: 'Puan 1-5 arasında olmalıdır' });

        const venue = await prisma.businessVenue.findUnique({ where: { id, status: 'APPROVED' } });
        if (!venue) return res.status(404).json({ message: 'Tesis bulunamadı' });
        const court = await prisma.venueCourt.findUnique({ where: { id: courtId } });
        if (!court || court.venueId !== id) return res.status(404).json({ message: 'Kort bulunamadı' });

        const review = await prisma.venueReview.upsert({
            where:  { userId_venueId_courtId: { userId: req.userId, venueId: id, courtId } },
            create: { venueId: id, courtId, userId: req.userId, rating, comment: comment?.trim() || null },
            update: { rating, comment: comment?.trim() || null },
            include: reviewInclude,
        });
        res.json({ review });
    } catch (e) { next(e); }
};

// DELETE /venues/:id/reviews/:reviewId — kendi yorumunu sil
export const deleteVenueReview = async (req, res, next) => {
    try {
        const review = await prisma.venueReview.findUnique({ where: { id: req.params.reviewId } });
        if (!review) return res.status(404).json({ message: 'Yorum bulunamadı' });
        if (review.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.venueReview.delete({ where: { id: req.params.reviewId } });
        res.json({ ok: true });
    } catch (e) { next(e); }
};
