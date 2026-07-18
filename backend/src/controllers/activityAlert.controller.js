import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';

const VALID_CATEGORIES = ['SPORTS', 'SOCIAL', 'ARTS', 'GAMES'];

export const getMyActivityAlert = async (req, res, next) => {
    try {
        const alert = await prisma.activityAlert.findUnique({ where: { userId: req.userId } });
        res.json(alert || {
            enabled: false, categories: [], subCategories: [], cities: [],
            useProximity: false, radiusKm: null, favoriteArtists: [],
        });
    } catch (err) { next(err); }
};

export const upsertMyActivityAlert = async (req, res, next) => {
    try {
        const { enabled, categories, subCategories, cities, useProximity, radiusKm, favoriteArtists } = req.body;

        const data = {
            enabled: enabled !== false,
            categories: Array.isArray(categories) ? categories.filter(c => VALID_CATEGORIES.includes(c)) : [],
            subCategories: Array.isArray(subCategories) ? subCategories.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()) : [],
            cities: Array.isArray(cities) ? cities.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim()) : [],
            useProximity: !!useProximity,
            radiusKm: useProximity ? (Number.isFinite(Number(radiusKm)) ? Math.max(1, Math.min(200, Math.round(Number(radiusKm)))) : 25) : null,
            favoriteArtists: Array.isArray(favoriteArtists) ? favoriteArtists.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim()) : [],
        };

        const alert = await prisma.activityAlert.upsert({
            where: { userId: req.userId },
            create: { userId: req.userId, ...data },
            update: data,
        });
        res.json(alert);
    } catch (err) { next(err); }
};

// Haversine — km cinsinden iki koordinat arası kuş uçuşu mesafe.
function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SUB_NAMES_TR = {
    tennis: 'Tenis', padel: 'Padel', football: 'Futbol', basketball: 'Basketbol', volleyball: 'Voleybol',
    music: 'Konser', theater: 'Tiyatro', cinema: 'Sinema',
};

// Kategori/alt-kategori + konum (yarıçap ve/veya seçili şehir) filtresine göre eşleşen
// ActivityAlert aboneleri bulunup bildirim gönderilir. notifyCitySubscribers ile aynı
// oluşturma noktalarından (rival/coach/equipment/referee/tournament) çağrılır — lat/lng
// sadece kort konumu bilinen ilanlarda (rival) gönderilir, diğerlerinde şehir eşleşmesi geçerlidir.
export async function notifyActivityAlertSubscribers({ subCategory, category, senderCity, senderUsername, senderId, itemId, tab = 'rivals', type = 'NEW_LISTING', title, body, lat = null, lng = null }) {
    if (!senderId) return;
    try {
        const candidates = await prisma.activityAlert.findMany({
            where: {
                enabled: true,
                userId: { not: senderId },
                OR: [{ categories: { isEmpty: true } }, { categories: { has: category } }],
            },
            include: { user: { select: { id: true, lat: true, lng: true } } },
        });
        if (candidates.length === 0) return;

        const matches = candidates.filter(a => {
            const subOk = a.subCategories.length === 0 || a.subCategories.includes(subCategory);
            if (!subOk) return false;

            const hasLocationFilter = a.cities.length > 0 || a.useProximity;
            if (!hasLocationFilter) return true;

            const cityOk = senderCity && a.cities.some(c => c.toLowerCase() === senderCity.toLowerCase());
            if (cityOk) return true;

            if (a.useProximity && a.radiusKm && lat != null && lng != null && a.user?.lat != null && a.user?.lng != null) {
                return distanceKm(a.user.lat, a.user.lng, lat, lng) <= a.radiusKm;
            }
            return false;
        });
        if (matches.length === 0) return;

        const sportName = SUB_NAMES_TR[subCategory] || subCategory;
        for (const a of matches) {
            createNotification(
                a.userId, type,
                title || `🔔 Yeni ${sportName} İlanı`,
                body || `@${senderUsername || 'Biri'} filtrelerinize uyan yeni bir ${sportName.toLowerCase()} ilanı ekledi.`,
                { category, subCategory, rivalId: itemId, tab }
            ).catch(() => {});
        }
    } catch (err) { console.error('[activityAlert] notifyActivityAlertSubscribers error:', err.message); }
}
