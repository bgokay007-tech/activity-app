// TMDB (The Movie Database) — vizyondaki filmler için dış kaynak (afiş, özet, vizyon
// tarihi). TMDB'de Türkiye'de gerçek seans/koltuk/bilet verisi YOK — sadece film meta
// verisi. Bilet satın alma, her filmin yanındaki linkle biletinial.com'un ilgili şehir
// sayfasına yönlendirilerek yapılır (apikey sunucu tarafında kalır).
const TMDB_BASE = 'https://api.themoviedb.org/3';

// biletinial.com/tr-tr/sinema/{şehir-slug} — Türkçe karakterleri sadeleştirir
function citySlug(city) {
    if (!city) return 'istanbul';
    return city
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i').replace(/İ/g, 'i')
        .replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeMovie(m, ticketUrl) {
    return {
        id: String(m.id),
        title: m.title,
        overview: m.overview || null,
        posterUrl: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
        releaseDate: m.release_date || null,
        rating: m.vote_average ?? null,
        ticketUrl,
    };
}

export const getNowPlayingMovies = async (req, res, next) => {
    try {
        const apiKey = process.env.TMDB_API_KEY;
        if (!apiKey) return res.status(503).json({ message: 'Sinema listesi şu anda yapılandırılmamış' });

        const { city, page } = req.query;
        const params = new URLSearchParams({
            api_key: apiKey,
            region: 'TR',
            language: 'tr-TR',
            page: page || '1',
        });

        const response = await fetch(`${TMDB_BASE}/movie/now_playing?${params.toString()}`);
        if (!response.ok) return res.status(502).json({ message: 'Film servisi yanıt vermedi' });
        const data = await response.json();

        const ticketUrl = `https://biletinial.com/tr-tr/sinema/${citySlug(city)}`;
        const movies = (data.results || []).map(m => normalizeMovie(m, ticketUrl));
        res.json({ movies, totalPages: data.total_pages || 1, cinemaListUrl: ticketUrl });
    } catch (e) { next(e); }
};
