// Bilet Al: birden fazla kaynaktan (Ticketmaster + SeatGeek) tenis/padel/voleybol bileti
// aramasi, tek listede birlestirilip tarihe gore siralanarak donuluyor. apikey'ler sunucu
// tarafinda kalir. countryCode kisitlamasi yok, boylece hem yerli hem yabanci (uluslararasi)
// etkinlikler ayni listede donuyor. Kaynaklardan biri yapilandirilmamissa (env key yoksa) ya
// da hata verirse sessizce atlanir, digeri calismaya devam eder.
const TM_BASE = 'https://app.ticketmaster.com/discovery/v2';
const SEATGEEK_BASE = 'https://api.seatgeek.com/2';

// Padel Ticketmaster'da ayri bir classification olarak taniniyor ama kapsam dar
// oldugu icin keyword ile de destekleniyor; tennis/volleyball dogrudan classification.
const SPORT_CLASSIFICATION = {
    tennis: 'tennis',
    padel: 'padel',
    volleyball: 'volleyball',
};

// SeatGeek taksonomi adlari Ticketmaster'dan farkli bir sozluk kullaniyor — kesin isimler
// gercek bir client_id ile test edilerek dogrulanmali (bkz. developer.seatgeek.com). Taksonomi
// eslesmese bile asagidaki "q" (serbest metin) arama terimi sayesinde sonuc donmeye devam eder.
const SEATGEEK_TAXONOMY = {
    tennis: 'tennis',
    padel: 'padel',
    volleyball: 'volleyball',
};
const SEATGEEK_QUERY_TERM = {
    tennis: 'tennis',
    padel: 'padel',
    volleyball: 'volleyball',
};

// Kullanıcı isteği: şehir filtresi Ticketmaster'a olduğu gibi gönderiliyordu — "Antalya merkez"
// gibi kullanıcının kendi yazdığı bir değer Ticketmaster'ın venue veritabanındaki tam şehir
// adıyla (ör. "Antalya", Türkçe karaktersiz "Istanbul") eşleşmediği için hiç sonuç dönmüyordu.
// Burada "merkez/ilçe/il" gibi ekleri temizleyip Türkçe karakterleri ASCII karşılığına çeviriyoruz.
// Aynı normalizasyon SeatGeek için de kullanılıyor (aynı sorun, aynı çözüm).
function normalizeCityForSearch(city) {
    if (!city) return city;
    const TR_MAP = { 'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C' };
    let s = city.trim();
    // "Antalya Merkez", "İstanbul merkez", "Konya İl" gibi ekleri kaldır (sadece kelime sonu).
    s = s.replace(/\s+(merkez|il|ilçe)\.?$/i, '').trim();
    s = s.replace(/[ıİğĞüÜşŞöÖçÇ]/g, ch => TR_MAP[ch] || ch);
    return s || city;
}

function normalizeTicketmasterEvent(e) {
    const venue = e._embedded?.venues?.[0] || null;
    const image = (e.images || []).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    const priceRange = (e.priceRanges || [])[0] || null;

    return {
        id: `tm_${e.id}`,
        source: 'ticketmaster',
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

function normalizeSeatGeekEvent(e) {
    const venue = e.venue || null;
    const stats = e.stats || null;
    const performerImage = (e.performers || []).find(p => p?.image)?.image || null;

    return {
        id: `sg_${e.id}`,
        source: 'seatgeek',
        name: e.title || e.short_title || null,
        city: venue?.city || null,
        country: venue?.country || null,
        venueName: venue?.name || null,
        date: e.datetime_local ? e.datetime_local.slice(0, 10) : null,
        time: e.datetime_local ? e.datetime_local.slice(11, 16) : null,
        imageUrl: performerImage,
        priceMin: stats?.lowest_price ?? null,
        priceMax: stats?.highest_price ?? null,
        currency: 'USD',
        ticketUrl: e.url || null,
    };
}

async function searchTicketmaster({ sport, city, dateFrom, dateTo }) {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) return [];
    const classificationName = SPORT_CLASSIFICATION[sport];
    if (!classificationName) return [];
    try {
        const params = new URLSearchParams({
            apikey: apiKey,
            classificationName,
            size: '30',
            sort: 'date,asc',
        });
        if (city) params.set('city', normalizeCityForSearch(city));
        if (dateFrom) params.set('startDateTime', `${dateFrom}T00:00:00Z`);
        if (dateTo) params.set('endDateTime', `${dateTo}T23:59:59Z`);

        const response = await fetch(`${TM_BASE}/events.json?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return [];
        const data = await response.json();
        return (data._embedded?.events || []).map(normalizeTicketmasterEvent);
    } catch { return []; }
}

async function searchSeatGeek({ sport, city, dateFrom, dateTo }) {
    const clientId = process.env.SEATGEEK_CLIENT_ID;
    if (!clientId) return [];
    const taxonomy = SEATGEEK_TAXONOMY[sport];
    const queryTerm = SEATGEEK_QUERY_TERM[sport];
    if (!taxonomy && !queryTerm) return [];
    try {
        const params = new URLSearchParams({
            client_id: clientId,
            per_page: '30',
            sort: 'datetime_local.asc',
        });
        if (taxonomy) params.set('taxonomies.name', taxonomy);
        if (queryTerm) params.set('q', queryTerm);
        if (city) params.set('venue.city', normalizeCityForSearch(city));
        if (dateFrom) params.set('datetime_local.gte', `${dateFrom}T00:00:00`);
        if (dateTo) params.set('datetime_local.lte', `${dateTo}T23:59:59`);

        const response = await fetch(`${SEATGEEK_BASE}/events?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return [];
        const data = await response.json();
        return (data.events || []).map(normalizeSeatGeekEvent);
    } catch { return []; }
}

export const searchSportsTickets = async (req, res, next) => {
    try {
        const { sport, city, dateFrom, dateTo } = req.query;
        if (!SPORT_CLASSIFICATION[sport]) return res.status(400).json({ message: 'Geçersiz spor dalı' });

        // Kullanıcı isteği: tüm kaynaklardan gelen turnuvalar TEK listede, aynı anda,
        // birlikte filtrelenebilir şekilde gösterilsin — kaynaklardan biri başarısız olursa
        // (key yok/hata) diğeri sessizce devam eder (bkz. searchTicketmaster/searchSeatGeek).
        const [tmEvents, sgEvents] = await Promise.all([
            searchTicketmaster({ sport, city, dateFrom, dateTo }),
            searchSeatGeek({ sport, city, dateFrom, dateTo }),
        ]);

        const events = [...tmEvents, ...sgEvents].sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');
        });

        res.json({ events });
    } catch (e) { next(e); }
};
