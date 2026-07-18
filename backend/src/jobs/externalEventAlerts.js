import cron from 'node-cron';
import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';

// Konser/tiyatro Ticketmaster'dan geldiği için (uygulama içi ilan değil) yeni etkinlik
// oluşturma anında tetiklenemez — bu job periyodik olarak favori sanatçı (konser) ve
// seçili şehir (tiyatro) bazında Ticketmaster'ı tarar, ActivityAlert eşleşen kullanıcılara
// bildirim gönderir. Aynı etkinlik bir kullanıcıya tekrar bildirilmesin diye
// NotifiedExternalEvent'te işaretlenir.
const TM_BASE = 'https://app.ticketmaster.com/discovery/v2';

function artsSubOk(alert, sub) {
    const catOk = alert.categories.length === 0 || alert.categories.includes('ARTS');
    const subOk = alert.subCategories.length === 0 || alert.subCategories.includes(sub);
    return catOk && subOk;
}

async function searchTicketmaster(classificationName, extraParams) {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) return [];
    const params = new URLSearchParams({
        apikey: apiKey, countryCode: 'TR', classificationName, size: '30', sort: 'date,asc', ...extraParams,
    });
    try {
        const response = await fetch(`${TM_BASE}/events.json?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return [];
        const data = await response.json();
        return data._embedded?.events || [];
    } catch { return []; }
}

async function notifyForEvent(userId, event, kind, artist) {
    const already = await prisma.notifiedExternalEvent.findUnique({
        where: { userId_externalId: { userId, externalId: event.id } },
    }).catch(() => null);
    if (already) return;

    const venue = event._embedded?.venues?.[0] || null;
    const city = venue?.city?.name || '';
    const date = event.dates?.start?.localDate || '';

    await createNotification(
        userId,
        kind === 'music' ? 'FAVORITE_ARTIST_CONCERT' : 'THEATER_ALERT',
        kind === 'music' ? `🎵 ${artist} — Yeni Konser` : `🎭 Yeni Tiyatro Etkinliği`,
        `${event.name}${city ? ` — ${city}` : ''}${date ? ` — ${date}` : ''}`,
        { externalId: event.id, kind, ticketUrl: event.url || null }
    ).catch(() => {});

    await prisma.notifiedExternalEvent.create({ data: { userId, externalId: event.id } }).catch(() => {});
}

async function checkFavoriteArtistConcerts() {
    const alerts = await prisma.activityAlert.findMany({
        where: { enabled: true, favoriteArtists: { isEmpty: false } },
    });
    const relevant = alerts.filter(a => artsSubOk(a, 'music'));
    if (relevant.length === 0) return;

    const artistToUsers = new Map();
    for (const a of relevant) {
        for (const artist of a.favoriteArtists) {
            const key = artist.toLowerCase();
            if (!artistToUsers.has(key)) artistToUsers.set(key, { artist, userIds: [] });
            artistToUsers.get(key).userIds.push(a.userId);
        }
    }

    for (const { artist, userIds } of artistToUsers.values()) {
        const events = await searchTicketmaster('music', { keyword: artist });
        for (const event of events) {
            for (const userId of userIds) {
                await notifyForEvent(userId, event, 'music', artist);
            }
        }
    }
}

async function checkTheaterByCity() {
    const alerts = await prisma.activityAlert.findMany({
        where: { enabled: true, cities: { isEmpty: false } },
    });
    const relevant = alerts.filter(a => artsSubOk(a, 'theater'));
    if (relevant.length === 0) return;

    const cityToUsers = new Map();
    for (const a of relevant) {
        for (const city of a.cities) {
            const key = city.toLowerCase();
            if (!cityToUsers.has(key)) cityToUsers.set(key, { city, userIds: [] });
            cityToUsers.get(key).userIds.push(a.userId);
        }
    }

    for (const { city, userIds } of cityToUsers.values()) {
        const events = await searchTicketmaster('theatre', { city });
        for (const event of events) {
            for (const userId of userIds) {
                await notifyForEvent(userId, event, 'theater', null);
            }
        }
    }
}

export function startExternalEventAlertsJob() {
    // Ticketmaster günlük kotasını zorlamamak için 4 saatte bir
    cron.schedule('0 */4 * * *', () => {
        checkFavoriteArtistConcerts().catch(err => console.error('[externalEventAlerts] concert check error:', err.message));
        checkTheaterByCity().catch(err => console.error('[externalEventAlerts] theater check error:', err.message));
    });
    console.log('✅ External event alerts job scheduled (every 4h)');
}
