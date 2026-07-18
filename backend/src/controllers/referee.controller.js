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
        res.json(listings);
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
