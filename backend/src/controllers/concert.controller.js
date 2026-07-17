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
        date: e.dates?.start?.localDate || null,
        time: e.dates?.start?.localTime || null,
        imageUrl: image?.url || null,
        priceMin: priceRange?.min ?? null,
        priceMax: priceRange?.max ?? null,
        currency: priceRange?.currency || null,
        ticketUrl: e.url || null,
    };
}

export const searchConcerts = async (req, res, next) => {
    try {
        const apiKey = process.env.TICKETMASTER_API_KEY;
        if (!apiKey) return res.status(503).json({ message: 'Konser arama şu anda yapılandırılmamış' });

        const { city, artist, dateFrom, dateTo } = req.query;

        const params = new URLSearchParams({
            apikey: apiKey,
            countryCode: 'TR',
            classificationName: 'music',
            size: '30',
            sort: 'date,asc',
        });
        if (city) params.set('city', city);
        if (artist) params.set('keyword', artist);
        if (dateFrom) params.set('startDateTime', `${dateFrom}T00:00:00Z`);
        if (dateTo) params.set('endDateTime', `${dateTo}T23:59:59Z`);

        const response = await fetch(`${TM_BASE}/events.json?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return res.status(502).json({ message: 'Konser servisi yanıt vermedi' });
        const data = await response.json();
        const concerts = (data._embedded?.events || []).map(normalizeConcert);
        res.json({ concerts });
    } catch (e) { next(e); }
};
