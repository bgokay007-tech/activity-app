import prisma from '../config/prisma.js';

// Jamendo — ücretsiz/telifsiz katalog API'si. client_id sunucu tarafında kalır,
// mobil uygulamaya hiç sızmaz (arama isteği bizim backend'imiz üzerinden proxy'lenir).
const JAMENDO_BASE = 'https://api.jamendo.com/v3.0';

function normalizeTrack(t) {
    return {
        trackId: String(t.id),
        title: t.name,
        artist: t.artist_name,
        imageUrl: t.image || null,
        streamUrl: t.audio,
        duration: t.duration ?? null,
    };
}

export const searchMusic = async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.status(400).json({ message: 'q parametresi gerekli' });
        const clientId = process.env.JAMENDO_CLIENT_ID;
        if (!clientId) return res.status(503).json({ message: 'Müzik arama şu anda yapılandırılmamış' });

        const url = `${JAMENDO_BASE}/tracks/?client_id=${encodeURIComponent(clientId)}&format=json&limit=30&search=${encodeURIComponent(q)}&include=musicinfo&audioformat=mp32`;
        const response = await fetch(url);
        if (!response.ok) return res.status(502).json({ message: 'Müzik servisi yanıt vermedi' });
        const data = await response.json();
        const tracks = Array.isArray(data.results) ? data.results.map(normalizeTrack) : [];
        res.json({ tracks });
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
        const { trackId, title, artist, imageUrl, streamUrl, duration } = req.body;
        if (!trackId || !title || !artist || !streamUrl) {
            return res.status(400).json({ message: 'trackId, title, artist, streamUrl zorunludur' });
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
