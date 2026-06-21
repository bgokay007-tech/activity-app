import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';

const VALID_TABS = ['rivals', 'tournaments', 'coaches', 'equipment'];

export const getMyAlert = async (req, res, next) => {
    try {
        const { subCategory } = req.params;
        const tab = VALID_TABS.includes(req.query.tab) ? req.query.tab : 'rivals';
        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { city: true } });

        // Return all subscribed cities for this user/sub/tab
        const alerts = await prisma.cityAlert.findMany({
            where: { userId: req.userId, subCategory, tab },
            select: { city: true },
        });
        const subscribedCities = alerts.map(a => a.city);

        res.json({
            subscribed: user?.city ? subscribedCities.includes(user.city) : subscribedCities.length > 0,
            city: user?.city || null,
            subscribedCities,
        });
    } catch (err) { next(err); }
};

export const toggleAlert = async (req, res, next) => {
    try {
        const { subCategory, tab: rawTab, city: explicitCity } = req.body;
        const tab = VALID_TABS.includes(rawTab) ? rawTab : 'rivals';
        if (!subCategory) return res.status(400).json({ message: 'subCategory gerekli' });

        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { city: true } });
        const city = explicitCity || user?.city;
        if (!city) return res.status(400).json({ message: 'Profilinizde şehir bilgisi bulunamadı. Profil sayfasından şehrinizi ekleyin.' });

        const existing = await prisma.cityAlert.findUnique({
            where: { userId_subCategory_city_tab: { userId: req.userId, subCategory, city, tab } },
        });

        if (existing) {
            await prisma.cityAlert.delete({ where: { id: existing.id } });
        } else {
            await prisma.cityAlert.create({ data: { userId: req.userId, city, subCategory, tab } });
        }

        // Return updated subscribed cities list
        const allAlerts = await prisma.cityAlert.findMany({
            where: { userId: req.userId, subCategory, tab },
            select: { city: true },
        });
        const subscribedCities = allAlerts.map(a => a.city);

        return res.json({
            subscribed: !existing,
            city,
            subscribedCities,
        });
    } catch (err) {
        console.error('[toggleAlert] error:', err.message, err.code);
        next(err);
    }
};

const SUB_NAMES_TR = {
    tennis: 'Tenis', padel: 'Padel', football: 'Futbol',
    basketball: 'Basketbol', volleyball: 'Voleybol',
    swimming: 'Yüzme', running: 'Koşu', cycling: 'Bisiklet',
    boxing: 'Boks', martial_arts: 'Dövüş Sanatları', wellness: 'Yoga/Pilates',
};

const TAB_LABELS_TR = {
    rivals: 'Rakip İlanı',
    tournaments: 'Turnuva',
    coaches: 'Antrenör İlanı',
    equipment: 'Ekipman İlanı',
};

export async function notifyCitySubscribers({ subCategory, category, senderCity, senderUsername, senderId, itemId, tab = 'rivals' }) {
    if (!senderCity || !senderId) return;
    try {
        const sportName = SUB_NAMES_TR[subCategory] || subCategory;
        const tabLabel  = TAB_LABELS_TR[tab] || tab;

        const subscribers = await prisma.cityAlert.findMany({
            where: { subCategory, city: { equals: senderCity, mode: 'insensitive' }, tab },
            select: { userId: true },
        });
        console.log(`[cityAlert] tab=${tab} senderId=${senderId} senderCity=${senderCity} sub=${subCategory} — found ${subscribers.length} subscriber(s)`);
        const toNotify = subscribers.filter(s => s.userId !== senderId);
        console.log(`[cityAlert] after filter: ${toNotify.length} to notify — ids: ${toNotify.map(s => s.userId).join(', ') || 'none'}`);
        for (const sub of toNotify) {
            createNotification(
                sub.userId, 'NEW_LISTING',
                `📍 ${senderCity} — Yeni ${sportName} ${tabLabel}`,
                `@${senderUsername} yeni bir ${sportName} ${tabLabel.toLowerCase()} ekledi.`,
                { category, subCategory, rivalId: itemId }
            ).catch(() => {});
        }
    } catch (err) { console.error('[cityAlert] notifyCitySubscribers error:', err.message); }
}
