// Ticketmaster Discovery API — tenis, padel, voleybol icin ulusal+uluslararasi mac
// bileti aramasi. apikey sunucu tarafinda kalir. countryCode kisitlamasi yok, boylece
// hem yerli hem yabanci (uluslararasi) etkinlikler ayni listede donuyor.
const TM_BASE = 'https://app.ticketmaster.com/discovery/v2';

// Padel Ticketmaster'da ayri bir classification olarak taniniyor ama kapsam dar
// oldugu icin keyword ile de destekleniyor; tennis/volleyball dogrudan classification.
const SPORT_CLASSIFICATION = {
    tennis: 'tennis',
    padel: 'padel',
    volleyball: 'volleyball',
};

function normalizeSportsEvent(e) {
    const venue = e._embedded?.venues?.[0] || null;
    const image = (e.images || []).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    const priceRange = (e.priceRanges || [])[0] || null;

    return {
        id: e.id,
        name: e.name,
        city: venue?.city?.name || null,
        country: venue?.country?.countryCode || null,
        venueName: venue?.name || null,
        date: e.dates?.start?.localDate || null,
        time: e.dates?.start?.localTime || null,
        imageUrl: image?.url || null,
        priceMin: priceRange?.min ?? null,
        priceMax: priceRange?.max ?? null,
        currency: priceRange?.currency || null,
        ticketUrl: e.url || null,
    };
}

export const searchSportsTickets = async (req, res, next) => {
    try {
        const apiKey = process.env.TICKETMASTER_API_KEY;
        if (!apiKey) return res.status(503).json({ message: 'Bilet arama şu anda yapılandırılmamış' });

        const { sport, city, dateFrom, dateTo } = req.query;
        const classificationName = SPORT_CLASSIFICATION[sport];
        if (!classificationName) return res.status(400).json({ message: 'Geçersiz spor dalı' });

        const params = new URLSearchParams({
            apikey: apiKey,
            classificationName,
            size: '30',
            sort: 'date,asc',
        });
        if (city) params.set('city', city);
        if (dateFrom) params.set('startDateTime', `${dateFrom}T00:00:00Z`);
        if (dateTo) params.set('endDateTime', `${dateTo}T23:59:59Z`);

        const response = await fetch(`${TM_BASE}/events.json?${params.toString()}`);
        if (!response.ok) return res.status(502).json({ message: 'Bilet servisi yanıt vermedi' });
        const data = await response.json();
        const events = (data._embedded?.events || []).map(normalizeSportsEvent);
        res.json({ events });
    } catch (e) { next(e); }
};
