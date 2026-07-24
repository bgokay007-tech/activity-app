// Ticketmaster Discovery API — tiyatro oyunu ilanlari icin dis kaynak (concert.controller.js
// ile ayni proxy deseni, classificationName=theatre disinda). apikey sunucu tarafinda kalir.
const TM_BASE = 'https://app.ticketmaster.com/discovery/v2';

function normalizePlay(e) {
    const venue = e._embedded?.venues?.[0] || null;
    const image = (e.images || []).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    const priceRange = (e.priceRanges || [])[0] || null;

    return {
        id: e.id,
        name: e.name,
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

export const searchTheaterEvents = async (req, res, next) => {
    try {
        const apiKey = process.env.TICKETMASTER_API_KEY;
        if (!apiKey) return res.status(503).json({ message: 'Tiyatro arama şu anda yapılandırılmamış' });

        const { city, name, dateFrom, dateTo, lat, lng, radius } = req.query;

        const params = new URLSearchParams({
            apikey: apiKey,
            classificationName: 'theatre',
            size: '30',
            sort: 'date,asc',
        });
        // bkz. concert.controller.js — aynı gerekçe: ülke kısıtı kaldırıldı, konum
        // bazlı (harita) aramada latlong+radius kullanılıyor.
        if (lat && lng) {
            params.set('latlong', `${lat},${lng}`);
            params.set('radius', String(radius || 50));
            params.set('unit', 'km');
        } else if (city) {
            params.set('city', city);
        }
        if (name) params.set('keyword', name);
        if (dateFrom) params.set('startDateTime', `${dateFrom}T00:00:00Z`);
        if (dateTo) params.set('endDateTime', `${dateTo}T23:59:59Z`);

        const response = await fetch(`${TM_BASE}/events.json?${params.toString()}`);
        if (!response.ok) return res.status(502).json({ message: 'Tiyatro servisi yanıt vermedi' });
        const data = await response.json();
        const plays = (data._embedded?.events || []).map(normalizePlay);
        res.json({ plays });
    } catch (e) { next(e); }
};
