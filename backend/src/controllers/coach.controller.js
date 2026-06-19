import prisma from '../config/prisma.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

export const getListings = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;
        const listings = await prisma.coachListing.findMany({
            where: {
                category: category || undefined,
                subCategory: subCategory || undefined,
            },
            include: { user: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(listings);
    } catch (err) { next(err); }
};

export const createListing = async (req, res, next) => {
    try {
        const {
            category, subCategory,
            credentialLevel, certName, experience,
            individual, group, priceIndividual, priceGroup, maxGroupSize,
            location, city, days, timeFrom, timeTo, description,
        } = req.body;

        if (!credentialLevel || !location || !category || !subCategory)
            return res.status(400).json({ message: 'Missing required fields' });

        const listing = await prisma.coachListing.create({
            data: {
                userId: req.userId,
                category, subCategory,
                credentialLevel, certName, experience: Number(experience) || 0,
                individual: Boolean(individual),
                group: Boolean(group),
                priceIndividual: Number(priceIndividual) || 0,
                priceGroup: Number(priceGroup) || 0,
                maxGroupSize: Number(maxGroupSize) || 4,
                location, city,
                days: days || [],
                timeFrom: timeFrom || '09:00',
                timeTo: timeTo || '21:00',
                description,
            },
            include: { user: { select: USER_SELECT } },
        });
        res.status(201).json(listing);

        // Notify city-alert subscribers for coaches tab (async, non-blocking)
        notifyCitySubscribers({
            subCategory: listing.subCategory,
            category: listing.category,
            senderCity: listing.city || null,
            senderUsername: listing.user?.username || '',
            senderId: req.userId,
            itemId: listing.id,
            tab: 'coaches',
        });
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
