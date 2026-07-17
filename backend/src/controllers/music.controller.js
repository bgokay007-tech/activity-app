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
        const response = await fetch(url);
        if (!response.ok) return res.status(502).json({ message: 'Müzik servisi yanıt vermedi' });
        const data = await response.json();
        const tracks = (data.results || []).map(normalizeItunesTrack);
        res.json({ tracks });
    } catch (e) { next(e); }
};

// Apple'ın herkese açık, anahtar gerektirmeyen "Top Songs" chart feed'i — arama
// yapılmadan önce kullanıcıya boş ekran yerine Türkiye'de popüler şarkıları
// önermek için. 1 saat bellekte cache'lenir (chart sık değişmiyor).
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

export const getTrendingMusic = async (req, res, next) => {
    try {
        if (trendingCache && Date.now() < trendingCacheExpiry) return res.json({ tracks: trendingCache });
        const response = await fetch('https://rss.applemarketingtools.com/api/v2/tr/music/most-played/50/songs.json');
        if (!response.ok) return res.status(502).json({ message: 'Müzik servisi yanıt vermedi' });
        const data = await response.json();
        const tracks = (data.feed?.results || []).map(normalizeAppleChartTrack);
        trendingCache = tracks;
        trendingCacheExpiry = Date.now() + 60 * 60 * 1000;
        res.json({ tracks });
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
    const response = await fetch(url);
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
