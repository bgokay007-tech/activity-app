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
