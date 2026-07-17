import prisma from '../config/prisma.js';

// Spotify Web API (Client Credentials akışı) — katalog arama/meta veri için,
// kullanıcı girişi gerektirmeden ücretsiz. Access token bellekte cache'lenir.
let spotifyToken = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken() {
    if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
    });
    if (!response.ok) return null;
    const data = await response.json();
    spotifyToken = data.access_token;
    spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return spotifyToken;
}

function normalizeSpotifyTrack(t) {
    return {
        trackId: t.id,
        title: t.name,
        artist: (t.artists || []).map(a => a.name).join(', '),
        imageUrl: t.album?.images?.[0]?.url || null,
        duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
    };
}

export const searchMusic = async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.status(400).json({ message: 'q parametresi gerekli' });
        const token = await getSpotifyToken();
        if (!token) return res.status(503).json({ message: 'Müzik arama şu anda yapılandırılmamış' });

        const url = `https://api.spotify.com/v1/search?type=track&market=TR&limit=30&q=${encodeURIComponent(q)}`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return res.status(502).json({ message: 'Müzik servisi yanıt vermedi' });
        const data = await response.json();
        const tracks = (data.tracks?.items || []).map(normalizeSpotifyTrack);
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
