// Ticketmaster Discovery API — konser ilanlari icin dis kaynak. apikey sunucu
// tarafinda kalir, mobil uygulamaya hic sizmaz (arama istegi backend uzerinden proxy'lenir).
const TM_BASE = 'https://app.ticketmaster.com/discovery/v2';

function normalizeConcert(e) {
    const venue = e._embedded?.venues?.[0] || null;
    const attraction = e._embedded?.attractions?.[0] || null;
    const image = (e.images || []).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    const priceRange = (e.priceRanges || [])[0] || null;

    return {
        id: e.id,
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

async function fetchTmEvents(baseParams) {
    const response = await fetch(`${TM_BASE}/events.json?${baseParams.toString()}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const data = await response.json();
    return data._embedded?.events || [];
}

export const searchConcerts = async (req, res, next) => {
    try {
        const apiKey = process.env.TICKETMASTER_API_KEY;
        if (!apiKey) return res.status(503).json({ message: 'Konser arama şu anda yapılandırılmamış' });

        const { city, artist, dateFrom, dateTo, lat, lng, radius } = req.query;

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
            events = await fetchTmEvents(buildParams({ city }));
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

        const concerts = events.map(normalizeConcert);
        res.json({ concerts });
    } catch (e) { next(e); }
};
