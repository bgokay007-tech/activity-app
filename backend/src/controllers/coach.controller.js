import prisma from '../config/prisma.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';
import { createNotification } from './notification.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

// Kullanıcı isteği: voleybolde zaten çalışan CV + admin onayı zorunluluğu artık tenis ve
// padelde de geçerli — bu dallardaki antrenörlük başvurusu da CV'siz gönderilemiyor, admin
// onaylamadan ilan başkalarına görünmüyor. Diğer dallarda (badminton, masa tenisi, airsoft vb.)
// önceki davranış (CV isteğe bağlı, yayınlanır yayınlanmaz görünür) değişmedi.
const COACH_APPROVAL_SPORTS = ['volleyball', 'tennis', 'padel'];

export const getListings = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;
        const listings = await prisma.coachListing.findMany({
            where: {
                status: 'ACTIVE',
                category: category || undefined,
                subCategory: subCategory || undefined,
                // Voleybol/tenis/padelde admin onayı olmayan bir ilan başkalarına GÖRÜNMEZ —
                // sahibi kendi başvurusunun durumunu takip edebilsin diye kendi ilanını her
                // zaman görür (bkz. RefereeListing.approved ile aynı desen).
                OR: [
                    { subCategory: { notIn: COACH_APPROVAL_SPORTS } },
                    { approved: true },
                    { userId: req.userId },
                ],
            },
            include: { user: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        const listingIds = listings.map(l => l.id);
        const ratings = listingIds.length ? await prisma.coachReview.groupBy({
            by: ['coachListingId'],
            where: { coachListingId: { in: listingIds } },
            _avg: { rating: true },
            _count: { id: true },
        }) : [];
        const ratingMap = Object.fromEntries(ratings.map(r => [r.coachListingId, { avg: r._avg.rating, count: r._count.id }]));
        res.json(listings.map(l => ({
            ...l,
            avgRating: ratingMap[l.id]?.avg ?? null,
            reviewCount: ratingMap[l.id]?.count ?? 0,
        })));
    } catch (err) { next(err); }
};

// Sohbet bandı/bildirimden "o ilana git" ile gelindiğinde, ilan mevcut liste
// görünümünde olmasa bile doğrudan çekip detay modalını açabilmek için.
export const getListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.coachListing.findUnique({
            where: { id },
            include: { user: { select: USER_SELECT } },
        });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (COACH_APPROVAL_SPORTS.includes(listing.subCategory) && !listing.approved && listing.userId !== req.userId) {
            return res.status(404).json({ message: 'İlan bulunamadı' });
        }
        const agg = await prisma.coachReview.aggregate({
            where: { coachListingId: id },
            _avg: { rating: true },
            _count: { id: true },
        });
        res.json({ ...listing, avgRating: agg._avg.rating, reviewCount: agg._count.id });
    } catch (err) { next(err); }
};

// Öğrenci bir antrenöre "ders aldım" ilişkisi kurmak için istek gönderir —
// antrenör kabul edince öğrenci o antrenöre yorum/yıldız verebilir hale gelir.
export const requestLesson = async (req, res, next) => {
    try {
        const { id } = req.params; // coachListingId
        const { message } = req.body;
        const listing = await prisma.coachListing.findUnique({ where: { id } });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (listing.userId === req.userId) return res.status(400).json({ message: 'Kendi ilanınıza ders isteği gönderemezsiniz' });

        const existing = await prisma.coachLessonRequest.findUnique({
            where: { coachListingId_studentId: { coachListingId: id, studentId: req.userId } },
        });
        if (existing && existing.status !== 'REJECTED') {
            return res.status(400).json({ message: 'Bu antrenöre zaten bir istek gönderdiniz', status: existing.status });
        }

        if (existing) {
            await prisma.coachLessonRequest.update({
                where: { coachListingId_studentId: { coachListingId: id, studentId: req.userId } },
                data: { status: 'PENDING', message: message || null },
            });
        } else {
            await prisma.coachLessonRequest.create({
                data: { coachListingId: id, studentId: req.userId, message: message || null },
            });
        }
        res.status(201).json({ message: 'Ders isteği gönderildi' });
    } catch (err) { next(err); }
};

// Antrenör kendi ilanına gelen ders isteklerini görür
export const getLessonRequests = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.coachListing.findUnique({ where: { id } });
        if (!listing || listing.userId !== req.userId) return res.status(403).json({ message: 'Forbidden' });
        const requests = await prisma.coachLessonRequest.findMany({
            where: { coachListingId: id, status: 'PENDING' },
            include: { student: { select: USER_SELECT } },
            orderBy: { createdAt: 'asc' },
        });
        res.json(requests);
    } catch (err) { next(err); }
};

export const respondLessonRequest = async (req, res, next) => {
    try {
        const { reqId } = req.params;
        const { action } = req.body; // 'accept' | 'reject'
        const lessonReq = await prisma.coachLessonRequest.findUnique({
            where: { id: reqId },
            include: { coachListing: true },
        });
        if (!lessonReq) return res.status(404).json({ message: 'İstek bulunamadı' });
        if (lessonReq.coachListing.userId !== req.userId) return res.status(403).json({ message: 'Forbidden' });
        if (lessonReq.status !== 'PENDING') return res.status(400).json({ message: 'Bu istek artık bekleyen durumda değil' });

        await prisma.coachLessonRequest.update({
            where: { id: reqId },
            data: { status: action === 'accept' ? 'ACCEPTED' : 'REJECTED' },
        });
        res.json({ message: action === 'accept' ? 'Kabul edildi' : 'Reddedildi' });
    } catch (err) { next(err); }
};

export const getReviews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const reviews = await prisma.coachReview.findMany({
            where: { coachListingId: id },
            include: { reviewer: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        const myLessonReq = req.userId ? await prisma.coachLessonRequest.findUnique({
            where: { coachListingId_studentId: { coachListingId: id, studentId: req.userId } },
        }) : null;
        res.json({
            reviews,
            avgRating: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null,
            canReview: myLessonReq?.status === 'ACCEPTED',
            myLessonStatus: myLessonReq?.status || null,
        });
    } catch (err) { next(err); }
};

export const submitReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const r = parseInt(rating, 10);
        if (!r || r < 1 || r > 5) return res.status(400).json({ message: 'Geçerli bir yıldız puanı girin (1-5)' });

        const accepted = await prisma.coachLessonRequest.findFirst({
            where: { coachListingId: id, studentId: req.userId, status: 'ACCEPTED' },
        });
        if (!accepted) return res.status(403).json({ message: 'Bu antrenörden ders almadığınız için yorum/puan veremezsiniz' });

        const review = await prisma.coachReview.upsert({
            where: { coachListingId_reviewerId: { coachListingId: id, reviewerId: req.userId } },
            update: { rating: r, comment: comment || null },
            create: { coachListingId: id, reviewerId: req.userId, rating: r, comment: comment || null },
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
            individual, group, priceIndividual, priceGroup, maxGroupSize,
            location, cities, days, timeFrom, timeTo, description,
        } = req.body;

        const citiesArr = Array.isArray(cities) ? cities.filter(Boolean) : [];
        if (!credentialLevel || !category || !subCategory)
            return res.status(400).json({ message: 'Missing required fields' });
        // Kullanıcı isteği: konum artık zorunlu değil, onun yerine bir/birden fazla şehir
        // zorunlu — antrenör hangi şehir(ler)de ders verdiğini belirtmek zorunda.
        if (citiesArr.length === 0)
            return res.status(400).json({ message: 'En az bir şehir seçmelisiniz' });
        // Kullanıcı isteği: voleybol/tenis/padelde antrenörlük başvurusu CV'siz gönderilemez —
        // admin onayı CV'ye bakarak veriliyor, CV eksikse başvuru zaten değerlendirilemez.
        if (COACH_APPROVAL_SPORTS.includes(subCategory) && !cvUrl)
            return res.status(400).json({ message: 'Bu dalda antrenörlük başvurusu için CV yüklemeniz zorunludur.' });

        const listing = await prisma.coachListing.create({
            data: {
                userId: req.userId,
                category, subCategory,
                credentialLevel, certName, certificateUrl,
                experience: Number(experience) || 0,
                achievements, achievementUrls: achievementUrls || [], cvUrl,
                individual: Boolean(individual),
                group: Boolean(group),
                priceIndividual: Number(priceIndividual) || 0,
                priceGroup: Number(priceGroup) || 0,
                maxGroupSize: Number(maxGroupSize) || 4,
                location: location || null, cities: citiesArr,
                days: days || [],
                timeFrom: timeFrom || '09:00',
                timeTo: timeTo || '21:00',
                description,
                // Voleybol/tenis/padelde admin onayı gerekiyor (approved varsayılan false
                // kalır); diğer dallarda hiç kontrol edilmediği için baştan onaylı sayılır —
                // davranış değişmesin diye.
                approved: !COACH_APPROVAL_SPORTS.includes(subCategory),
            },
            include: { user: { select: USER_SELECT } },
        });
        res.status(201).json(listing);

        // Notify city-alert subscribers for coaches tab (async, non-blocking) — artık
        // birden fazla şehir olabildiği için her şehir için ayrı ayrı bildirim taranıyor.
        const notifyCities = citiesArr.length > 0 ? citiesArr : [listing.city || null];
        for (const c of notifyCities) {
            notifyCitySubscribers({
                subCategory: listing.subCategory,
                category: listing.category,
                senderCity: c,
                senderUsername: listing.user?.username || '',
                senderId: req.userId,
                itemId: listing.id,
                tab: 'coaches',
            });
        }
        notifyActivityAlertSubscribers({
            subCategory: listing.subCategory,
            category: listing.category,
            senderCity: citiesArr[0] || listing.city || null,
            senderUsername: listing.user?.username || '',
            senderId: req.userId,
            itemId: listing.id,
            tab: 'coaches',
        });
    } catch (err) { next(err); }
};

export const updateListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.coachListing.findUnique({ where: { id } });
        if (!listing || listing.userId !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });

        const {
            credentialLevel, certName, certificateUrl, experience,
            achievements, achievementUrls, cvUrl,
            individual, group, priceIndividual, priceGroup, maxGroupSize,
            location, cities, days, timeFrom, timeTo, description,
        } = req.body;

        // Voleybol/tenis/padelde onaylı bir antrenör CV'sini değiştirirse onay otomatik
        // düşer — admin hangi CV'yi onayladığını biliyor, sessizce farklı bir CV'yle onaylı
        // kalınamaz.
        const cvChanged = cvUrl !== undefined && cvUrl !== listing.cvUrl;
        const revokeApproval = COACH_APPROVAL_SPORTS.includes(listing.subCategory) && listing.approved && cvChanged;

        const updated = await prisma.coachListing.update({
            where: { id },
            data: {
                ...(credentialLevel !== undefined && { credentialLevel }),
                ...(certName !== undefined && { certName }),
                ...(certificateUrl !== undefined && { certificateUrl }),
                ...(experience !== undefined && { experience: Number(experience) || 0 }),
                ...(achievements !== undefined && { achievements }),
                ...(achievementUrls !== undefined && { achievementUrls }),
                ...(cvUrl !== undefined && { cvUrl }),
                ...(individual !== undefined && { individual: Boolean(individual) }),
                ...(group !== undefined && { group: Boolean(group) }),
                ...(priceIndividual !== undefined && { priceIndividual: Number(priceIndividual) || 0 }),
                ...(priceGroup !== undefined && { priceGroup: Number(priceGroup) || 0 }),
                ...(maxGroupSize !== undefined && { maxGroupSize: Number(maxGroupSize) || 4 }),
                ...(location !== undefined && { location: location || null }),
                ...(cities !== undefined && { cities: Array.isArray(cities) ? cities.filter(Boolean) : [] }),
                ...(days !== undefined && { days }),
                ...(timeFrom !== undefined && { timeFrom }),
                ...(timeTo !== undefined && { timeTo }),
                ...(description !== undefined && { description }),
                ...(revokeApproval && { approved: false }),
            },
            include: { user: { select: USER_SELECT } },
        });
        res.json(updated);
        if (revokeApproval) {
            createNotification(req.userId, 'COACH_APPROVAL_REVOKED', '🚫 Antrenörlük Onayınız Kaldırıldı',
                'CV\'nizi değiştirdiğiniz için antrenörlük ilan onayınız kaldırıldı, yeni CV admin tarafından tekrar incelenene kadar ilanınız başkalarına görünmez.',
                {}
            ).catch(() => {});
        }
    } catch (err) { next(err); }
};

export const deleteListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.coachListing.findUnique({ where: { id } });
        if (!listing || listing.userId !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });
        await prisma.coachListing.delete({ where: { id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};
