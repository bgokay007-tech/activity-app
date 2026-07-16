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
        genreIds: m.genre_ids || [],
        ticketUrl,
    };
}

// TMDB'nin sabit tür (genre) listesi — id'ler tüm dillerde aynıdır, sadece isim
// çeviriliyor. Ayrı bir TMDB çağrısına gerek kalmasın diye burada sabit tutuluyor.
const MOVIE_GENRES = [
    { id: 28, name: 'Aksiyon' }, { id: 12, name: 'Macera' }, { id: 16, name: 'Animasyon' },
    { id: 35, name: 'Komedi' }, { id: 80, name: 'Suç' }, { id: 99, name: 'Belgesel' },
    { id: 18, name: 'Dram' }, { id: 10751, name: 'Aile' }, { id: 14, name: 'Fantastik' },
    { id: 36, name: 'Tarih' }, { id: 27, name: 'Korku' }, { id: 10402, name: 'Müzik' },
    { id: 9648, name: 'Gizem' }, { id: 10749, name: 'Romantik' }, { id: 878, name: 'Bilim Kurgu' },
    { id: 53, name: 'Gerilim' }, { id: 10752, name: 'Savaş' }, { id: 37, name: 'Western' },
];

export const getMovieGenres = async (req, res, next) => {
    res.json({ genres: MOVIE_GENRES });
};

export const getNowPlayingMovies = async (req, res, next) => {
    try {
        const apiKey = process.env.TMDB_API_KEY;
        if (!apiKey) return res.status(503).json({ message: 'Sinema listesi şu anda yapılandırılmamış' });

        const { city, page, genre } = req.query;
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
        const genreId = genre ? parseInt(genre, 10) : null;
        const results = genreId
            ? (data.results || []).filter(m => Array.isArray(m.genre_ids) && m.genre_ids.includes(genreId))
            : (data.results || []);
        const movies = results.map(m => normalizeMovie(m, ticketUrl));
        res.json({ movies, totalPages: data.total_pages || 1, cinemaListUrl: ticketUrl });
    } catch (e) { next(e); }
};

// Internet Archive (archive.org) — telif süresi dolmuş / kamu malı (public domain)
// klasik filmler için gerçek, ücretsiz ve tamamen yasal kaynak. Güncel/popüler
// yapımlar burada YOK — "feature_films" koleksiyonu eski (çoğunlukla 1920-60'lar
// arası) filmlerden oluşuyor. Ücretsiz API anahtarı gerekmiyor, doğrudan çağrılır.
const ARCHIVE_BASE = 'https://archive.org';

function normalizeClassicFilm(doc) {
    const desc = Array.isArray(doc.description) ? doc.description[0] : doc.description;
    return {
        id: doc.identifier,
        title: doc.title || doc.identifier,
        year: doc.year || null,
        description: desc || null,
        thumbnailUrl: `${ARCHIVE_BASE}/services/img/${doc.identifier}`,
    };
}

export const getClassicFilms = async (req, res, next) => {
    try {
        const { q, page } = req.query;
        const rows = 24;
        const start = (Math.max(1, parseInt(page) || 1) - 1) * rows;

        // format:"h.264" şart koşuluyor — aksi halde koleksiyondaki bazı kayıtların
        // gerçekte hiç oynatılabilir video dosyası yok (sadece metadata/torrent),
        // oynatma anında 404 ile karşılaşılıyordu.
        const params = new URLSearchParams({
            q: `collection:feature_films AND mediatype:movies AND format:"h.264"${q ? ` AND title:(${q})` : ''}`,
            output: 'json',
            rows: String(rows),
            start: String(start),
        });
        params.append('fl[]', 'identifier');
        params.append('fl[]', 'title');
        params.append('fl[]', 'year');
        params.append('fl[]', 'description');
        params.append('sort[]', 'downloads desc');

        const response = await fetch(`${ARCHIVE_BASE}/advancedsearch.php?${params.toString()}`);
        if (!response.ok) return res.status(502).json({ message: 'Film arşivi servisi yanıt vermedi' });
        const data = await response.json();
        const films = (data.response?.docs || []).map(normalizeClassicFilm);
        res.json({ films, totalFound: data.response?.numFound || 0 });
    } catch (e) { next(e); }
};

// Bir klasik filmin gerçek oynatılabilir video dosyasını bulur — liste ekranında
// her film için bunu çağırmak yerine, kullanıcı bir filme tıkladığında (oynatma
// anında) tek seferlik çözülür.
export const getClassicFilmStream = async (req, res, next) => {
    try {
        const { id } = req.params;
        const response = await fetch(`${ARCHIVE_BASE}/metadata/${encodeURIComponent(id)}`);
        if (!response.ok) return res.status(502).json({ message: 'Film bilgisi alınamadı' });
        const data = await response.json();
        const files = Array.isArray(data.files) ? data.files : [];
        const videoFile = files.find(f => f.format === 'h.264' || /\.mp4$/i.test(f.name || ''));
        if (!videoFile) return res.status(404).json({ message: 'Bu film için oynatılabilir dosya bulunamadı' });
        const videoUrl = `${ARCHIVE_BASE}/download/${encodeURIComponent(id)}/${encodeURIComponent(videoFile.name)}`;
        res.json({ videoUrl, title: data.metadata?.title || id });
    } catch (e) { next(e); }
};
