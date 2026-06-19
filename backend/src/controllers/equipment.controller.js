import prisma from '../config/prisma.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

export const getListings = async (req, res, next) => {
    try {
        const { category, subCategory, condition } = req.query;
        const listings = await prisma.equipmentListing.findMany({
            where: {
                ...(category    && { category }),
                ...(subCategory && { subCategory }),
                ...(condition   && { condition }),
            },
            include: { user: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(listings);
    } catch (err) { next(err); }
};

export const createListing = async (req, res, next) => {
    try {
        const { category, subCategory, condition, title, price, images, description, location, city } = req.body;

        if (!condition || !title || !category || !subCategory)
            return res.status(400).json({ message: 'Zorunlu alanlar eksik' });
        if (!['NEW', 'USED'].includes(condition))
            return res.status(400).json({ message: 'Geçersiz durum' });

        const listing = await prisma.equipmentListing.create({
            data: {
                userId: req.userId,
                category,
                subCategory,
                condition,
                title: title.trim(),
                price: parseInt(price) || 0,
                images: Array.isArray(images) ? images : [],
                description: description || null,
                location: location || null,
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
