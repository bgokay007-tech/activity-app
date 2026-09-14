import prisma from '../config/prisma.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

export const getListings = async (req, res, next) => {
    try {
        const { category, subCategory, city } = req.query;
        const listings = await prisma.clubListing.findMany({
            where: {
                status: 'ACTIVE',
                ...(category && { category }),
                ...(subCategory && { subCategory }),
                ...(city ? {
                    OR: [
                        { city: { contains: city, mode: 'insensitive' } },
                        { location: { contains: city, mode: 'insensitive' } },
                    ],
                } : {}),
            },
            include: { user: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        // cities Json içinde de şehir araması — Prisma Json üzerinde contains yok, JS tarafında.
        const q = city && String(city).trim().toLowerCase();
        const filtered = q
            ? listings.filter(l => {
                if ((l.city || '').toLowerCase().includes(q)) return true;
                if ((l.location || '').toLowerCase().includes(q)) return true;
                return Array.isArray(l.cities) && l.cities.some(c => (c || '').toLowerCase().includes(q));
            })
            : listings;
        res.json(filtered);
    } catch (err) { next(err); }
};

export const getListing = async (req, res, next) => {
    try {
        const listing = await prisma.clubListing.findUnique({
            where: { id: req.params.id },
            include: { user: { select: USER_SELECT } },
        });
        if (!listing || listing.status !== 'ACTIVE') return res.status(404).json({ message: 'Kulüp bulunamadı' });
        res.json(listing);
    } catch (err) { next(err); }
};

export const createListing = async (req, res, next) => {
    try {
        const {
            category, subCategory, name, description, location,
            cities, contactPhone, website, membershipFee, photoUrl,
        } = req.body;

        if (!category || !subCategory || !name?.trim())
            return res.status(400).json({ message: 'Zorunlu alanlar eksik' });

        const cityList = Array.isArray(cities)
            ? [...new Set(cities.map(c => String(c || '').trim()).filter(Boolean))]
            : [];
        if (cityList.length === 0)
            return res.status(400).json({ message: 'En az bir şehir seçmelisiniz' });

        let fee = null;
        if (membershipFee !== undefined && membershipFee !== null && membershipFee !== '') {
            fee = parseInt(membershipFee, 10);
            if (!Number.isFinite(fee) || fee < 0)
                return res.status(400).json({ message: 'Geçersiz üyelik ücreti' });
        }

        const listing = await prisma.clubListing.create({
            data: {
                userId: req.userId,
                category,
                subCategory,
                name: name.trim(),
                description: description?.trim() || null,
                location: location?.trim() || null,
                cities: cityList,
                city: cityList[0],
                contactPhone: contactPhone?.trim() || null,
                website: website?.trim() || null,
                membershipFee: fee,
                photoUrl: photoUrl?.trim() || null,
            },
            include: { user: { select: USER_SELECT } },
        });
        res.status(201).json(listing);

        const creatorInfo = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { username: true },
        }).catch(() => null);
        notifyCitySubscribers({
            subCategory: listing.subCategory,
            category: listing.category,
            senderCity: listing.city || null,
            senderUsername: creatorInfo?.username || '',
            senderId: req.userId,
            itemId: listing.id,
            tab: 'clubs',
        });
        notifyActivityAlertSubscribers({
            subCategory: listing.subCategory,
            category: listing.category,
            senderCity: listing.city || null,
            senderUsername: creatorInfo?.username || '',
            senderId: req.userId,
            itemId: listing.id,
            tab: 'clubs',
        });
    } catch (err) { next(err); }
};

export const updateListing = async (req, res, next) => {
    try {
        const listing = await prisma.clubListing.findUnique({ where: { id: req.params.id } });
        if (!listing) return res.status(404).json({ message: 'Kulüp bulunamadı' });
        if (listing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const {
            name, description, location, cities, contactPhone,
            website, membershipFee, photoUrl,
        } = req.body;

        const data = {};
        if (name !== undefined) {
            if (!name?.trim()) return res.status(400).json({ message: 'Kulüp adı zorunlu' });
            data.name = name.trim();
        }
        if (description !== undefined) data.description = description?.trim() || null;
        if (location !== undefined) data.location = location?.trim() || null;
        if (contactPhone !== undefined) data.contactPhone = contactPhone?.trim() || null;
        if (website !== undefined) data.website = website?.trim() || null;
        if (photoUrl !== undefined) data.photoUrl = photoUrl?.trim() || null;
        if (cities !== undefined) {
            const cityList = Array.isArray(cities)
                ? [...new Set(cities.map(c => String(c || '').trim()).filter(Boolean))]
                : [];
            if (cityList.length === 0)
                return res.status(400).json({ message: 'En az bir şehir seçmelisiniz' });
            data.cities = cityList;
            data.city = cityList[0];
        }
        if (membershipFee !== undefined) {
            if (membershipFee === null || membershipFee === '') data.membershipFee = null;
            else {
                const fee = parseInt(membershipFee, 10);
                if (!Number.isFinite(fee) || fee < 0)
                    return res.status(400).json({ message: 'Geçersiz üyelik ücreti' });
                data.membershipFee = fee;
            }
        }

        const updated = await prisma.clubListing.update({
            where: { id: listing.id },
            data,
            include: { user: { select: USER_SELECT } },
        });
        res.json(updated);
    } catch (err) { next(err); }
};

export const deleteListing = async (req, res, next) => {
    try {
        const listing = await prisma.clubListing.findUnique({ where: { id: req.params.id } });
        if (!listing) return res.status(404).json({ message: 'Bulunamadı' });
        const requester = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { isAdmin: true },
        });
        if (listing.userId !== req.userId && !requester?.isAdmin)
            return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.clubListing.delete({ where: { id: listing.id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};
