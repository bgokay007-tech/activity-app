import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';

const reviewInclude = {
    user: { select: { id: true, username: true, fullName: true, avatar: true } },
    court: { select: { id: true, name: true } },
};

const PRO_PACKAGES = ['PRO', 'PREMIUM'];

// Tesis sahibi Pro/Premium abonelikte mi? Öyleyse yorumlar yayınlanmadan önce admin onayı gerekir.
async function isProVenue(venue) {
    const now = new Date();
    const sub = await prisma.businessSubscription.findFirst({
        where: { userId: venue.userId, status: 'ACTIVE', endDate: { gt: now } },
    });
    return !!sub && PRO_PACKAGES.includes(sub.packageType);
}

async function notifyAdminsPendingReview(venue, review, targetLabel) {
    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    await Promise.all(admins.map(a =>
        createNotification(a.id, 'VENUE_REVIEW_PENDING', '⭐ Onay Bekleyen Yorum',
            `"${venue.name}" (${targetLabel}) için yeni bir yorum admin onayı bekliyor.`,
            { venueId: venue.id, reviewId: review.id }
        ).then(() => emitToUser(a.id, 'notification', {}).catch(() => {})).catch(() => {})
    ));
}

// GET /venues/:id/reviews — tesis + tüm kortların yorumları (yalnızca onaylanmış + kendi bekleyen yorumun)
export const getVenueReviews = async (req, res, next) => {
    try {
        const reviews = await prisma.venueReview.findMany({
            where: { venueId: req.params.id, OR: [{ status: 'APPROVED' }, { userId: req.userId }] },
            include: {
                ...reviewInclude,
                appeals: { where: { appealerId: req.userId }, select: { id: true, status: true, reason: true, adminNote: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const approvedReviews = reviews.filter(r => r.status === 'APPROVED');
        const venueReviews = approvedReviews.filter(r => !r.courtId);
        const venueRating  = venueReviews.length
            ? +(venueReviews.reduce((s, r) => s + r.rating, 0) / venueReviews.length).toFixed(1)
            : null;

        const courtMap = {};
        approvedReviews.filter(r => r.courtId).forEach(r => {
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

// POST /venues/:id/reviews
export const upsertVenueReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        if (!rating || rating < 1 || rating > 5)
            return res.status(400).json({ message: 'Puan 1-5 arasında olmalıdır' });

        const venue = await prisma.businessVenue.findUnique({ where: { id, status: 'APPROVED' } });
        if (!venue) return res.status(404).json({ message: 'Tesis bulunamadı' });

        const pro = await isProVenue(venue);
        const status = pro ? 'PENDING' : 'APPROVED';
        const data = { rating, comment: comment?.trim() || null, status };

        // @@unique([userId, venueId, courtId]) nullable courtId ile upsert'in compound-key
        // kısayolunda kullanılamıyor (Prisma null değeri kabul etmiyor) — bu yüzden elle yapılır.
        const existing = await prisma.venueReview.findFirst({ where: { userId: req.userId, venueId: id, courtId: null } });
        const review = existing
            ? await prisma.venueReview.update({ where: { id: existing.id }, data, include: reviewInclude })
            : await prisma.venueReview.create({ data: { venueId: id, courtId: null, userId: req.userId, ...data }, include: reviewInclude });

        if (venue.userId !== req.userId) {
            if (status === 'APPROVED') {
                const reviewer = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
                createNotification(
                    venue.userId, 'VENUE_REVIEW', '⭐ Tesisinize Yeni Yorum',
                    `${reviewer?.username} "${venue.name}" tesisinize ${rating} yıldız verdi${comment ? ': ' + comment.slice(0, 60) : ''}`,
                    { venueId: id, reviewId: review.id }
                ).then(() => emitToUser(venue.userId, 'notification', {}).catch(() => {})).catch(() => {});
            } else {
                notifyAdminsPendingReview(venue, review, venue.name).catch(() => {});
            }
        }

        res.json({ review });
    } catch (e) { next(e); }
};

// POST /venues/:id/courts/:courtId/reviews
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

        const pro = await isProVenue(venue);
        const status = pro ? 'PENDING' : 'APPROVED';
        const data = { rating, comment: comment?.trim() || null, status };

        const review = await prisma.venueReview.upsert({
            where:  { userId_venueId_courtId: { userId: req.userId, venueId: id, courtId } },
            create: { venueId: id, courtId, userId: req.userId, ...data },
            update: data,
            include: reviewInclude,
        });

        if (venue.userId !== req.userId) {
            if (status === 'APPROVED') {
                const reviewer = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
                createNotification(
                    venue.userId, 'VENUE_REVIEW', '⭐ Kortunuza Yeni Yorum',
                    `${reviewer?.username} "${court.name}" kortunuza ${rating} yıldız verdi${comment ? ': ' + comment.slice(0, 60) : ''}`,
                    { venueId: id, reviewId: review.id }
                ).then(() => emitToUser(venue.userId, 'notification', {}).catch(() => {})).catch(() => {});
            } else {
                notifyAdminsPendingReview(venue, review, court.name).catch(() => {});
            }
        }

        res.json({ review });
    } catch (e) { next(e); }
};

// GET /admin/venue-reviews?status=PENDING — admin bekleyen (veya diğer durumdaki) tesis yorumlarını görür
export const getPendingVenueReviews = async (req, res, next) => {
    try {
        const status = ['PENDING', 'APPROVED', 'REJECTED'].includes(req.query.status) ? req.query.status : 'PENDING';
        const reviews = await prisma.venueReview.findMany({
            where: { status },
            include: {
                ...reviewInclude,
                venue: { select: { id: true, name: true, branch: true, city: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(reviews);
    } catch (e) { next(e); }
};

// PATCH /admin/venue-reviews/:id — admin yorumu onaylar/reddeder
export const resolveVenueReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action, adminNote } = req.body; // action: 'APPROVE' | 'REJECT'
        if (!['APPROVE', 'REJECT'].includes(action))
            return res.status(400).json({ message: 'Geçersiz işlem' });

        const review = await prisma.venueReview.findUnique({
            where: { id },
            include: { venue: { select: { id: true, name: true, userId: true } }, court: { select: { name: true } } },
        });
        if (!review) return res.status(404).json({ message: 'Yorum bulunamadı' });

        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const updated = await prisma.venueReview.update({ where: { id }, data: { status: newStatus } });

        createNotification(
            review.userId,
            action === 'APPROVE' ? 'VENUE_REVIEW_APPROVED' : 'VENUE_REVIEW_REJECTED',
            action === 'APPROVE' ? '✅ Yorumunuz Yayınlandı' : '❌ Yorumunuz Reddedildi',
            action === 'APPROVE'
                ? `"${review.venue.name}"${review.court ? ' - ' + review.court.name : ''} için verdiğiniz yorum yayınlandı.`
                : `"${review.venue.name}"${review.court ? ' - ' + review.court.name : ''} için verdiğiniz yorum reddedildi.${adminNote ? ` Neden: ${adminNote}` : ''}`,
            { venueId: review.venueId }
        ).then(() => emitToUser(review.userId, 'notification', {}).catch(() => {})).catch(() => {});

        if (action === 'APPROVE' && review.venue.userId !== review.userId) {
            const reviewer = await prisma.user.findUnique({ where: { id: review.userId }, select: { username: true } });
            createNotification(
                review.venue.userId, 'VENUE_REVIEW',
                review.court ? '⭐ Kortunuza Yeni Yorum' : '⭐ Tesisinize Yeni Yorum',
                `${reviewer?.username} ${review.court ? `"${review.court.name}" kortunuza` : `"${review.venue.name}" tesisinize`} ${review.rating} yıldız verdi${review.comment ? ': ' + review.comment.slice(0, 60) : ''}`,
                { venueId: review.venueId, reviewId: review.id }
            ).then(() => emitToUser(review.venue.userId, 'notification', {}).catch(() => {})).catch(() => {});
        }

        res.json({ review: updated });
    } catch (e) { next(e); }
};

// DELETE /venues/:id/reviews/:reviewId
export const deleteVenueReview = async (req, res, next) => {
    try {
        const review = await prisma.venueReview.findUnique({ where: { id: req.params.reviewId } });
        if (!review) return res.status(404).json({ message: 'Yorum bulunamadı' });
        if (review.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.venueReview.delete({ where: { id: req.params.reviewId } });
        res.json({ ok: true });
    } catch (e) { next(e); }
};

// POST /venues/:venueId/reviews/:reviewId/appeal — PREMIUM işletme sahibi itiraz
export const createReviewAppeal = async (req, res, next) => {
    try {
        const { venueId, reviewId } = req.params;
        const { reason } = req.body;
        if (!reason?.trim()) return res.status(400).json({ message: 'İtiraz nedeni gereklidir' });

        const venue = await prisma.businessVenue.findUnique({ where: { id: venueId } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        // PREMIUM kontrolü
        const now = new Date();
        const sub = await prisma.businessSubscription.findFirst({
            where: { userId: req.userId, status: 'ACTIVE', endDate: { gt: now }, packageType: 'PREMIUM' },
        });
        if (!sub) return res.status(403).json({ message: 'İtiraz özelliği yalnızca Premium pakette mevcuttur' });

        const review = await prisma.venueReview.findUnique({ where: { id: reviewId } });
        if (!review || review.venueId !== venueId) return res.status(404).json({ message: 'Yorum bulunamadı' });

        const appeal = await prisma.reviewAppeal.upsert({
            where:  { reviewId_appealerId: { reviewId, appealerId: req.userId } },
            create: { reviewId, venueId, appealerId: req.userId, reason: reason.trim() },
            update: { reason: reason.trim(), status: 'PENDING', adminNote: null },
        });

        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        await Promise.all(admins.map(a =>
            createNotification(a.id, 'REVIEW_APPEAL', '⚖️ Yorum İtirazı',
                `${venue.name} için bir yorum itirazı geldi`,
                { appealId: appeal.id, venueId }
            ).then(() => emitToUser(a.id, 'notification', {}).catch(() => {})).catch(() => {})
        ));

        res.json({ appeal });
    } catch (e) { next(e); }
};

// GET /venues/:venueId/reviews/appeals — işletme sahibi kendi itirazlarını görür
export const getMyVenueAppeals = async (req, res, next) => {
    try {
        const { venueId } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id: venueId } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const appeals = await prisma.reviewAppeal.findMany({
            where: { venueId, appealerId: req.userId },
            include: {
                review: { include: { user: { select: { id: true, username: true, avatar: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(appeals);
    } catch (e) { next(e); }
};

// GET /admin/review-appeals — admin tüm itirazları görür
export const getReviewAppeals = async (req, res, next) => {
    try {
        const appeals = await prisma.reviewAppeal.findMany({
            where: { status: 'PENDING' },
            include: {
                review: { include: { user: { select: { id: true, username: true, avatar: true } } } },
                venue:  { select: { id: true, name: true } },
                appealer: { select: { id: true, username: true, businessName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(appeals);
    } catch (e) { next(e); }
};

// PATCH /admin/review-appeals/:id — admin karara bağlar
export const resolveReviewAppeal = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, adminNote, deleteReview } = req.body;
        if (!['RESOLVED', 'REJECTED'].includes(status)) return res.status(400).json({ message: 'Geçersiz durum' });

        const appeal = await prisma.reviewAppeal.update({
            where: { id },
            data: { status, adminNote: adminNote?.trim() || null },
            include: { venue: { select: { userId: true, name: true } } },
        });

        if (deleteReview && status === 'RESOLVED') {
            await prisma.venueReview.delete({ where: { id: appeal.reviewId } }).catch(() => {});
        }

        // İşletmeye bildir
        createNotification(
            appeal.appealerId, 'APPEAL_RESOLVED',
            status === 'RESOLVED' ? '✅ İtirazınız Kabul Edildi' : '❌ İtirazınız Reddedildi',
            adminNote || (status === 'RESOLVED' ? 'İtirazınız incelendi ve kabul edildi.' : 'İtirazınız incelendi ve reddedildi.'),
            { appealId: id }
        ).then(() => emitToUser(appeal.appealerId, 'notification', {}).catch(() => {})).catch(() => {});

        res.json({ appeal });
    } catch (e) { next(e); }
};
