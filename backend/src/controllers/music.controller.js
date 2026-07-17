import prisma from '../config/prisma.js';

// iTunes Search API — katalog arama/meta veri için, anahtar/abonelik gerektirmeyen
// ücretsiz genel API. (Spotify Web API artık /v1/search için uygulama sahibinin
// Premium abonelik sahibi olmasını şart koşuyor, bu yüzden iTunes'a geçildi.)
function normalizeItunesTrack(t) {
    return {
        trackId: String(t.trackId),
        title: t.trackName,
        artist: t.artistName,
        imageUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100', '600x600') : null,
        duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : null,
    };
}

export const searchMusic = async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.status(400).json({ message: 'q parametresi gerekli' });

        const url = `https://itunes.apple.com/search?media=music&entity=song&country=TR&limit=30&term=${encodeURIComponent(q)}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return res.status(502).json({ message: 'Müzik servisi yanıt vermedi' });
        const data = await response.json();
        const tracks = (data.results || []).map(normalizeItunesTrack);
        res.json({ tracks });
    } catch (e) { next(e); }
};

// Apple'ın herkese açık, anahtar gerektirmeyen "Top Songs"/"Top Playlists" chart
// feed'leri — arama yapılmadan önce kullanıcıya boş ekran yerine popüler şarkı ve
// liste önerileri göstermek için. Türkiye (tr) ve global (us) şartları ardışık
// sıralanarak (TR, US, TR, US, ...) yerli/yabancı karışık bir öneri akışı oluşturulur.
// 1 saat bellekte cache'lenir (chart sık değişmiyor).
let trendingCache = null;
let trendingCacheExpiry = 0;

function normalizeAppleChartTrack(t) {
    return {
        trackId: String(t.id),
        title: t.name,
        artist: t.artistName,
        imageUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : null,
        duration: null,
    };
}

function normalizeAppleChartPlaylist(p) {
    return {
        playlistId: p.id,
        name: p.name,
        imageUrl: p.artworkUrl100 ? p.artworkUrl100.replace('100x100', '400x400') : null,
        url: p.url,
    };
}

function interleave(a, b) {
    const out = [];
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
        if (a[i]) out.push(a[i]);
        if (b[i]) out.push(b[i]);
    }
    return out;
}

// Apple'ın RSS feed'i bazen ağır gecikiyor/hiç yanıt vermiyor — zaman aşımı olmadan
// bu, Promise.all'u ve dolayısıyla tüm /music/trending isteğini Railway'in gateway
// timeout'una (30sn) çarpıp 502 dönmesine kadar bloke ediyordu. Artık her istek en
// fazla 8sn bekliyor, süre dolarsa o parça için boş liste dönüp diğerleri etkilenmiyor.
async function fetchAppleChart(country, kind, limit) {
    try {
        const response = await fetch(
            `https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/${limit}/${kind}.json`,
            { signal: AbortSignal.timeout(8000) },
        );
        if (!response.ok) return [];
        const data = await response.json();
        return data.feed?.results || [];
    } catch {
        return [];
    }
}

export const getTrendingMusic = async (req, res, next) => {
    try {
        if (trendingCache && Date.now() < trendingCacheExpiry) return res.json(trendingCache);

        const [trSongs, usSongs, trPlaylists, usPlaylists] = await Promise.all([
            fetchAppleChart('tr', 'songs', 30),
            fetchAppleChart('us', 'songs', 30),
            fetchAppleChart('tr', 'playlists', 8),
            fetchAppleChart('us', 'playlists', 8),
        ]);

        if (trSongs.length === 0 && usSongs.length === 0) {
            return res.status(502).json({ message: 'Müzik servisi yanıt vermedi' });
        }

        const tracks = interleave(trSongs.map(normalizeAppleChartTrack), usSongs.map(normalizeAppleChartTrack));
        const playlists = interleave(trPlaylists.map(normalizeAppleChartPlaylist), usPlaylists.map(normalizeAppleChartPlaylist));

        const result = { tracks, playlists };
        trendingCache = result;
        trendingCacheExpiry = Date.now() + 60 * 60 * 1000;
        res.json(result);
    } catch (e) { next(e); }
};

// YouTube Data API v3 — Spotify tam şarkı çaldırmadığı (sadece 30sn önizleme) için,
// bulunan şarkı adı+sanatçı ile eşleşen YouTube videosu aranıp uygulama içi (gizli)
// bir video oynatıcı ile sesi çalınır. Her arama günlük kotadan (10.000 birim,
// search.list = 100 birim → ~100 farklı şarkı/gün ücretsiz sınır) düştüğü için
// sonuçlar kalıcı olarak bellekte cache'lenir — aynı şarkı bir daha aranmaz.
const youtubeCache = new Map(); // "title|||artist" (lowercase) -> videoId

export async function resolveYoutubeVideoId(title, artist) {
    const key = `${title}|||${artist}`.toLowerCase();
    if (youtubeCache.has(key)) return youtubeCache.get(key);
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;
    const q = `${title} ${artist} audio`;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=1&q=${encodeURIComponent(q)}&key=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const data = await response.json();
    const videoId = data.items?.[0]?.id?.videoId || null;
    if (videoId) youtubeCache.set(key, videoId);
    return videoId;
}

export const resolveTrackStream = async (req, res, next) => {
    try {
        const { title, artist } = req.query;
        if (!title || !artist) return res.status(400).json({ message: 'title, artist zorunludur' });
        const videoId = await resolveYoutubeVideoId(title, artist);
        if (!videoId) return res.status(404).json({ message: 'Bu şarkı için oynatılabilir video bulunamadı' });
        res.json({ videoId, streamUrl: `https://www.youtube.com/watch?v=${videoId}` });
    } catch (e) { next(e); }
};

export const getLikedTracks = async (req, res, next) => {
    try {
        const liked = await prisma.likedTrack.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(liked);
    } catch (e) { next(e); }
};

export const likeTrack = async (req, res, next) => {
    try {
        const { trackId, title, artist, imageUrl, duration } = req.body;
        let { streamUrl } = req.body;
        if (!trackId || !title || !artist) {
            return res.status(400).json({ message: 'trackId, title, artist zorunludur' });
        }
        if (!streamUrl) {
            const videoId = await resolveYoutubeVideoId(title, artist);
            if (!videoId) return res.status(404).json({ message: 'Bu şarkı için oynatılabilir video bulunamadı' });
            streamUrl = `https://www.youtube.com/watch?v=${videoId}`;
        }
        const liked = await prisma.likedTrack.upsert({
            where: { userId_trackId: { userId: req.userId, trackId: String(trackId) } },
            update: {},
            create: {
                userId: req.userId, trackId: String(trackId), title, artist,
                imageUrl: imageUrl || null, streamUrl, duration: duration ?? null,
            },
        });
        res.status(201).json(liked);
    } catch (e) { next(e); }
};

export const unlikeTrack = async (req, res, next) => {
    try {
        const { trackId } = req.params;
        await prisma.likedTrack.deleteMany({ where: { userId: req.userId, trackId } });
        res.json({ ok: true });
    } catch (e) { next(e); }
};
