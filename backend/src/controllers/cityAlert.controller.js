import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';

export const getMyAlert = async (req, res, next) => {
    try {
        const { subCategory } = req.params;
        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { city: true } });
        if (!user?.city) return res.json({ subscribed: false, city: null });
        const alert = await prisma.cityAlert.findUnique({
            where: { userId_subCategory_city: { userId: req.userId, subCategory, city: user.city } },
        });
        res.json({ subscribed: !!alert, city: user.city });
    } catch (err) { next(err); }
};

export const toggleAlert = async (req, res, next) => {
    try {
        const { subCategory } = req.body;
        if (!subCategory) return res.status(400).json({ message: 'subCategory gerekli' });

        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { city: true } });
        if (!user?.city) return res.status(400).json({ message: 'Profilinizde şehir bilgisi bulunamadı. Profil sayfasından şehrinizi ekleyin.' });

        const existing = await prisma.cityAlert.findUnique({
            where: { userId_subCategory_city: { userId: req.userId, subCategory, city: user.city } },
        });

        if (existing) {
            await prisma.cityAlert.delete({ where: { id: existing.id } });
            return res.json({ subscribed: false, city: user.city });
        } else {
            await prisma.cityAlert.create({ data: { userId: req.userId, city: user.city, subCategory } });
            return res.json({ subscribed: true, city: user.city });
        }
    } catch (err) {
        console.error('[toggleAlert] error:', err.message, err.code);
        next(err);
    }
};

// Called from rival.controller.js after a new listing is created
export async function notifyCitySubscribers({ subCategory, category, senderCity, senderUsername, senderId, rivalId }) {
    if (!senderCity) return;
    try {
        const subscribers = await prisma.cityAlert.findMany({
            where: { subCategory, city: senderCity, userId: { not: senderId } },
            select: { userId: true },
        });
        for (const sub of subscribers) {
            createNotification(
                sub.userId, 'NEW_LISTING',
                `📍 ${senderCity} — Yeni İlan`,
                `@${senderUsername} ${subCategory} maçı arıyor.`,
                { category, subCategory, rivalId }
            ).catch(() => {});
        }
    } catch { /* non-critical */ }
}
