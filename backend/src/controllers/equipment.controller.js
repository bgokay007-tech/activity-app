import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser, broadcast } from '../config/socket.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

// Opsiyon süresi geçmiş (reservedUntil < now) ilanları otomatik olarak ACTIVE'e döndürür —
// alıcı tarihine kadar dönmezse ilan tekrar herkese açık hale gelir.
async function expireStaleReservations() {
    const now = new Date();
    const stale = await prisma.equipmentListing.findMany({
        where: { status: 'RESERVED', reservedUntil: { lt: now } },
        select: { id: true },
    });
    if (stale.length > 0) {
        await prisma.equipmentListing.updateMany({
            where: { id: { in: stale.map(s => s.id) } },
            data: { status: 'ACTIVE', reservedForUserId: null, reservedUntil: null },
        });
    }
}

export const getListings = async (req, res, next) => {
    try {
        await expireStaleReservations();
        const { category, subCategory, condition, status } = req.query;
        const statusWhere = status === 'SOLD' ? { status: 'SOLD' } : { status: { in: ['ACTIVE', 'RESERVED'] } };
        const listings = await prisma.equipmentListing.findMany({
            where: {
                ...statusWhere,
                ...(category    && { category }),
                ...(subCategory && { subCategory }),
                ...(condition   && { condition }),
            },
            include: {
                user: { select: USER_SELECT },
                offers: { where: { OR: [{ status: 'PENDING' }, { fromUserId: req.userId }] } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(listings.map(l => ({
            ...l,
            offerCount: l.offers.filter(o => o.status === 'PENDING').length,
            myOffer: l.offers.find(o => o.fromUserId === req.userId) || null,
            offers: undefined,
        })));
    } catch (err) { next(err); }
};

// Tek bir ilanı doğrudan getirir — bildirim/sohbetten "o ilana git" ile açılırken kullanılır
// (liste o an başka bir durum/koşul filtresinde olabilir, listeden aramak yerine direkt çeker).
export const getListing = async (req, res, next) => {
    try {
        await expireStaleReservations();
        const { id } = req.params;
        const listing = await prisma.equipmentListing.findUnique({
            where: { id },
            include: {
                user: { select: USER_SELECT },
                offers: { where: { fromUserId: req.userId } },
            },
        });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        res.json({ ...listing, myOffer: listing.offers[0] || null, offers: undefined });
    } catch (err) { next(err); }
};

export const createListing = async (req, res, next) => {
    try {
        const { category, subCategory, condition, title, price, images, description, location, city } = req.body;

        if (!condition || !title || !category || !subCategory)
            return res.status(400).json({ message: 'Zorunlu alanlar eksik' });
        if (!['NEW', 'USED'].includes(condition))
            return res.status(400).json({ message: 'Geçersiz durum' });
        if (!parseInt(price) || parseInt(price) <= 0)
            return res.status(400).json({ message: 'Fiyat zorunludur' });
        if (!location || !location.trim())
            return res.status(400).json({ message: 'Konum zorunludur' });
        if (!description || description.trim().length < 5)
            return res.status(400).json({ message: 'Açıklama en az 5 karakter olmalıdır' });
        if (!Array.isArray(images) || images.length === 0)
            return res.status(400).json({ message: 'En az 1 fotoğraf eklemelisiniz' });

        const listing = await prisma.equipmentListing.create({
            data: {
                userId: req.userId,
                category,
                subCategory,
                condition,
                title: title.trim(),
                price: parseInt(price) || 0,
                images,
                description: description.trim(),
                location: location.trim(),
                city: city || null,
            },
            include: { user: { select: USER_SELECT } },
        });
        res.status(201).json(listing);

        // Notify city-alert subscribers for equipment tab (async, non-blocking)
        const creatorInfo = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } }).catch(() => null);
        notifyCitySubscribers({
            subCategory: listing.subCategory,
            category: listing.category,
            senderCity: listing.city || null,
            senderUsername: creatorInfo?.username || '',
            senderId: req.userId,
            itemId: listing.id,
            tab: 'equipment',
        });
        notifyActivityAlertSubscribers({
            subCategory: listing.subCategory,
            category: listing.category,
            senderCity: listing.city || null,
            senderUsername: creatorInfo?.username || '',
            senderId: req.userId,
            itemId: listing.id,
            tab: 'equipment',
        });
    } catch (err) { next(err); }
};

export const deleteListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.equipmentListing.findUnique({ where: { id } });
        if (!listing) return res.status(404).json({ message: 'Bulunamadı' });
        const requester = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        if (listing.userId !== req.userId && !requester?.isAdmin)
            return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.equipmentListing.delete({ where: { id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};

// Alıcı bir fiyat teklifi gönderir — daha önce reddedilmiş/geri çekilmişse yeniden teklif etmiş olur.
export const sendOffer = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { price, message } = req.body;
        if (!parseInt(price) || parseInt(price) <= 0)
            return res.status(400).json({ message: 'Geçerli bir teklif fiyatı girin' });

        const listing = await prisma.equipmentListing.findUnique({ where: { id } });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (listing.userId === req.userId) return res.status(400).json({ message: 'Kendi ilanınıza teklif veremezsiniz' });
        if (listing.status === 'SOLD') return res.status(400).json({ message: 'Bu ürün satıldı' });

        const offer = await prisma.equipmentOffer.upsert({
            where: { listingId_fromUserId: { listingId: id, fromUserId: req.userId } },
            create: { listingId: id, fromUserId: req.userId, price: parseInt(price), message: message?.trim() || null },
            update: { price: parseInt(price), message: message?.trim() || null, status: 'PENDING' },
            include: { fromUser: { select: USER_SELECT } },
        });
        res.status(201).json(offer);

        emitToUser(listing.userId, 'equipmentOffer', { listingId: id });
        createNotification(
            listing.userId, 'EQUIPMENT_OFFER',
            '💰 Yeni Teklif',
            `${offer.fromUser?.fullName || offer.fromUser?.username}, "${listing.title}" ilanınıza ${offer.price}₺ teklif verdi.`,
            { listingId: id, category: listing.category, subCategory: listing.subCategory }
        ).catch(() => {});
    } catch (err) { next(err); }
};

// İlan sahibi kendi ilanına gelen teklifleri görür.
export const getOffers = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.equipmentListing.findUnique({ where: { id } });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (listing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const offers = await prisma.equipmentOffer.findMany({
            where: { listingId: id },
            include: { fromUser: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(offers);
    } catch (err) { next(err); }
};

// İlan sahibi bir teklifi kabul/red eder ya da karşı teklif verir; karşı teklife de
// alıcı kabul/red ile yanıt verir. Kabul edilirse (doğrudan ya da karşı teklif üzerinden),
// anlaşılan alıcı için ilan belirtilen tarihe kadar opsiyonlu (RESERVED) hale gelir.
export const respondOffer = async (req, res, next) => {
    try {
        const { offerId } = req.params;
        const { action, reservedUntil, price } = req.body; // action: 'accept' | 'reject' | 'counter' | 'accept_counter' | 'reject_counter'

        const offer = await prisma.equipmentOffer.findUnique({
            where: { id: offerId },
            include: { listing: true, fromUser: { select: USER_SELECT } },
        });
        if (!offer) return res.status(404).json({ message: 'Teklif bulunamadı' });

        const isOwner = offer.listing.userId === req.userId;
        const isBuyer = offer.fromUserId === req.userId;

        // İlan sahibi aksiyonları
        if (['accept', 'reject', 'counter'].includes(action)) {
            if (!isOwner) return res.status(403).json({ message: 'Yetkisiz' });
            if (offer.status !== 'PENDING') return res.status(400).json({ message: 'Bu teklif artık bekleyen durumda değil' });
        }
        // Alıcı aksiyonları — sadece kendi teklifine gelen karşı teklife yanıt verebilir
        if (['accept_counter', 'reject_counter'].includes(action)) {
            if (!isBuyer) return res.status(403).json({ message: 'Yetkisiz' });
            if (offer.status !== 'COUNTERED') return res.status(400).json({ message: 'Bu teklif için bekleyen bir karşı teklif yok' });
        }

        if (action === 'reject') {
            await prisma.equipmentOffer.update({ where: { id: offerId }, data: { status: 'REJECTED' } });
            res.json({ message: 'Teklif reddedildi' });
            createNotification(
                offer.fromUserId, 'EQUIPMENT_OFFER',
                '❌ Teklifiniz Reddedildi',
                `"${offer.listing.title}" ilanına verdiğiniz ${offer.price}₺ teklif reddedildi.`,
                { listingId: offer.listingId, category: offer.listing.category, subCategory: offer.listing.subCategory }
            ).catch(() => {});
            return;
        }

        if (action === 'counter') {
            const counterPrice = parseInt(price);
            if (!counterPrice || counterPrice <= 0) return res.status(400).json({ message: 'Geçerli bir karşı teklif fiyatı girin' });

            const updated = await prisma.equipmentOffer.update({ where: { id: offerId }, data: { status: 'COUNTERED', counterPrice } });
            res.json(updated);
            createNotification(
                offer.fromUserId, 'EQUIPMENT_OFFER',
                '↔️ Karşı Teklif Aldınız',
                `"${offer.listing.title}" ilanı için verdiğiniz ${offer.price}₺ teklife karşılık ${counterPrice}₺ karşı teklif geldi.`,
                { listingId: offer.listingId, category: offer.listing.category, subCategory: offer.listing.subCategory }
            ).catch(() => {});
            return;
        }

        if (action === 'reject_counter') {
            await prisma.equipmentOffer.update({ where: { id: offerId }, data: { status: 'REJECTED' } });
            res.json({ message: 'Karşı teklif reddedildi' });
            createNotification(
                offer.listing.userId, 'EQUIPMENT_OFFER',
                '❌ Karşı Teklifiniz Reddedildi',
                `"${offer.listing.title}" ilanı için verdiğiniz ${offer.counterPrice}₺ karşı teklif reddedildi.`,
                { listingId: offer.listingId, category: offer.listing.category, subCategory: offer.listing.subCategory }
            ).catch(() => {});
            return;
        }

        if (action === 'accept_counter') {
            // Alıcı karşı teklifi kabul eder — fiyat karşı teklife güncellenir, ilan sahibinin
            // opsiyon tarihi seçip nihai onayı vermesi için tekrar PENDING'e döner.
            const updated = await prisma.equipmentOffer.update({
                where: { id: offerId },
                data: { status: 'PENDING', price: offer.counterPrice, counterPrice: null },
            });
            res.json(updated);
            createNotification(
                offer.listing.userId, 'EQUIPMENT_OFFER',
                '✅ Karşı Teklifiniz Kabul Edildi',
                `${offer.fromUser?.fullName || offer.fromUser?.username}, "${offer.listing.title}" ilanı için verdiğiniz ${offer.counterPrice}₺ karşı teklifi kabul etti — onaylamak için opsiyon tarihi seçin.`,
                { listingId: offer.listingId, category: offer.listing.category, subCategory: offer.listing.subCategory }
            ).catch(() => {});
            return;
        }

        if (action === 'accept') {
            if (!reservedUntil) return res.status(400).json({ message: 'Opsiyon tarihi zorunludur' });
            const untilDate = new Date(reservedUntil);
            if (isNaN(untilDate) || untilDate <= new Date())
                return res.status(400).json({ message: 'Geçerli bir gelecek tarih seçin' });

            const [updatedOffer, updatedListing] = await Promise.all([
                prisma.equipmentOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } }),
                prisma.equipmentListing.update({
                    where: { id: offer.listingId },
                    data: { status: 'RESERVED', reservedForUserId: offer.fromUserId, reservedUntil: untilDate },
                    include: { user: { select: USER_SELECT } },
                }),
            ]);
            res.json({ offer: updatedOffer, listing: updatedListing });

            broadcast('equipmentUpdate', updatedListing);
            createNotification(
                offer.fromUserId, 'EQUIPMENT_OFFER',
                '✅ Teklifiniz Kabul Edildi',
                `"${offer.listing.title}" ilanı, ${untilDate.toLocaleDateString('tr-TR')} tarihine kadar sizin için opsiyonlu.`,
                { listingId: offer.listingId, category: offer.listing.category, subCategory: offer.listing.subCategory }
            ).catch(() => {});
            return;
        }

        return res.status(400).json({ message: 'Geçersiz aksiyon' });
    } catch (err) { next(err); }
};

// İlan sahibi anlaşma bozulunca opsiyonu iptal edip ilanı tekrar herkese açar.
export const cancelReservation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.equipmentListing.findUnique({ where: { id } });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (listing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        if (listing.status !== 'RESERVED') return res.status(400).json({ message: 'Bu ilan opsiyonlu değil' });

        const reservedForUserId = listing.reservedForUserId;
        const updated = await prisma.equipmentListing.update({
            where: { id },
            data: { status: 'ACTIVE', reservedForUserId: null, reservedUntil: null },
            include: { user: { select: USER_SELECT } },
        });
        res.json(updated);
        broadcast('equipmentUpdate', updated);
        if (reservedForUserId) {
            createNotification(
                reservedForUserId, 'EQUIPMENT_OFFER',
                '⚠️ Opsiyon İptal Edildi',
                `"${listing.title}" ilanındaki opsiyonunuz iptal edildi, ilan tekrar satışa açıldı.`,
                { listingId: id, category: listing.category, subCategory: listing.subCategory }
            ).catch(() => {});
        }
    } catch (err) { next(err); }
};

// İlan sahibi satışı tamamlayınca ilan "Satılanlar" sekmesine geçer.
export const markSold = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.equipmentListing.findUnique({ where: { id } });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (listing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        if (listing.status === 'SOLD') return res.status(400).json({ message: 'Bu ilan zaten satıldı olarak işaretli' });

        const updated = await prisma.equipmentListing.update({
            where: { id },
            data: { status: 'SOLD' },
            include: { user: { select: USER_SELECT } },
        });
        res.json(updated);
        broadcast('equipmentUpdate', updated);

        // Bekleyen diğer teklifleri kapat — ürün artık satıldı.
        prisma.equipmentOffer.updateMany({
            where: { listingId: id, status: 'PENDING' },
            data: { status: 'REJECTED' },
        }).catch(() => {});
    } catch (err) { next(err); }
};
