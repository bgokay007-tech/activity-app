// Konser ilanlari icin dis kaynaklar: Ticketmaster + SeatGeek, tek listede birlestirilip
// tekillestiriliyor (bkz. ticketSearch.js — sporda kullanilan ayni tarih-tabani/dedup mantigi).
// apikey/client_id sunucu tarafinda kalir, mobil uygulamaya hic sizmaz.
import { clampDateFrom, normalizeCityForSearch, dedupeEvents } from '../utils/ticketSearch.js';

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2';
const SEATGEEK_BASE = 'https://api.seatgeek.com/2';

function normalizeTmConcert(e) {
    const venue = e._embedded?.venues?.[0] || null;
    const attraction = e._embedded?.attractions?.[0] || null;
    const image = (e.images || []).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    const priceRange = (e.priceRanges || [])[0] || null;

    return {
        id: `tm_${e.id}`,
        source: 'ticketmaster',
        name: e.name,
        artist: attraction?.name || e.name,
        city: venue?.city?.name || null,
        venueName: venue?.name || null,
        venueAddress: venue?.address?.line1 || null,
        venueLat: venue?.location?.latitude != null ? Number(venue.location.latitude) : null,
        venueLng: venue?.location?.longitude != null ? Number(venue.location.longitude) : null,
        date: e.dates?.start?.localDate || null,
        time: e.dates?.start?.localTime || null,
        imageUrl: image?.url || null,
        priceMin: priceRange?.min ?? null,
        priceMax: priceRange?.max ?? null,
        currency: priceRange?.currency || null,
        ticketUrl: e.url || null,
    };
}

function normalizeSeatGeekConcert(e) {
    const venue = e.venue || null;
    const stats = e.stats || null;
    const performer = (e.performers || []).find(p => p?.image) || e.performers?.[0] || null;

    return {
        id: `sg_${e.id}`,
        source: 'seatgeek',
        name: e.title || e.short_title || null,
        artist: performer?.name || e.title || null,
        city: venue?.city || null,
        venueName: venue?.name || null,
        venueAddress: venue?.address || null,
        venueLat: venue?.location?.lat != null ? Number(venue.location.lat) : null,
        venueLng: venue?.location?.lon != null ? Number(venue.location.lon) : null,
        date: e.datetime_local ? e.datetime_local.slice(0, 10) : null,
        time: e.datetime_local ? e.datetime_local.slice(11, 16) : null,
        imageUrl: performer?.image || null,
        priceMin: stats?.lowest_price ?? null,
        priceMax: stats?.highest_price ?? null,
        currency: 'USD',
        ticketUrl: e.url || null,
    };
}

async function fetchTmEvents(baseParams) {
    const response = await fetch(`${TM_BASE}/events.json?${baseParams.toString()}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const data = await response.json();
    return data._embedded?.events || [];
}

async function searchTicketmasterConcerts({ city, artist, dateFrom, dateTo, lat, lng, radius }) {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) return [];
    try {
        const buildParams = (extra) => {
            const p = new URLSearchParams({
                apikey: apiKey,
                classificationName: 'music',
                size: '30',
                sort: 'date,asc',
            });
            if (artist) p.set('keyword', artist);
            if (dateFrom) p.set('startDateTime', `${dateFrom}T00:00:00Z`);
            if (dateTo) p.set('endDateTime', `${dateTo}T23:59:59Z`);
            Object.entries(extra || {}).forEach(([k, v]) => p.set(k, v));
            return p;
        };

        let events;
        if (lat && lng) {
            events = await fetchTmEvents(buildParams({ latlong: `${lat},${lng}`, radius: String(radius || 50), unit: 'km' }));
        } else if (city) {
            events = await fetchTmEvents(buildParams({ city: normalizeCityForSearch(city) }));
        } else {
            // Belirli bir şehir/konum verilmediyse: tek bir kısıtsız sorgu küçük
            // "size" limiti (30) yüzünden neredeyse tamamen büyük pazarlara
            // (ör. ABD) kayıyor, Türkiye hiç çıkmıyordu. Türkiye'yi garantilemek
            // için ayrı bir TR sorgusu + genel (kısıtsız) sorgu birleştirilip
            // tekilleştiriliyor — hem Türkiye hem dünya birlikte gösterilir.
            const [trEvents, globalEvents] = await Promise.all([
                fetchTmEvents(buildParams({ countryCode: 'TR' })),
                fetchTmEvents(buildParams({})),
            ]);
            const seen = new Set();
            events = [...trEvents, ...globalEvents].filter(e => {
                if (seen.has(e.id)) return false;
                seen.add(e.id);
                return true;
            });
        }
        return events.map(normalizeTmConcert);
    } catch { return []; }
}

async function searchSeatGeekConcerts({ city, artist, dateFrom, dateTo }) {
    const clientId = process.env.SEATGEEK_CLIENT_ID;
    if (!clientId) return [];
    try {
        const params = new URLSearchParams({
            client_id: clientId,
            'taxonomies.name': 'concert',
            per_page: '30',
            sort: 'datetime_local.asc',
        });
        if (artist) params.set('q', artist);
        if (city) params.set('venue.city', normalizeCityForSearch(city));
        if (dateFrom) params.set('datetime_local.gte', `${dateFrom}T00:00:00`);
        if (dateTo) params.set('datetime_local.lte', `${dateTo}T23:59:59`);

        const response = await fetch(`${SEATGEEK_BASE}/events?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return [];
        const data = await response.json();
        return (data.events || []).map(normalizeSeatGeekConcert);
    } catch { return []; }
}

export const searchConcerts = async (req, res, next) => {
    try {
        const { city, artist, dateTo, lat, lng, radius } = req.query;
        const dateFrom = clampDateFrom(req.query.dateFrom);

        const [tmEvents, sgEvents] = await Promise.all([
            searchTicketmasterConcerts({ city, artist, dateFrom, dateTo, lat, lng, radius }),
            searchSeatGeekConcerts({ city, artist, dateFrom, dateTo }),
        ]);

        const concerts = dedupeEvents([...tmEvents, ...sgEvents]).sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');
        });

        res.json({ concerts });
    } catch (e) { next(e); }
};
