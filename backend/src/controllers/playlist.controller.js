import prisma from '../config/prisma.js';

export const getMyPlaylists = async (req, res, next) => {
    try {
        const playlists = await prisma.playlist.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(playlists);
    } catch (e) { next(e); }
};

export const createPlaylist = async (req, res, next) => {
    try {
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ message: 'İsim zorunludur' });
        const playlist = await prisma.playlist.create({
            data: { userId: req.userId, name: name.trim(), tracks: [] },
        });
        res.status(201).json(playlist);
    } catch (e) { next(e); }
};

export const updatePlaylist = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, tracks } = req.body;
        const playlist = await prisma.playlist.findUnique({ where: { id } });
        if (!playlist) return res.status(404).json({ message: 'Çalma listesi bulunamadı' });
        if (playlist.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const data = {};
        if (name !== undefined) {
            if (!name?.trim()) return res.status(400).json({ message: 'İsim boş olamaz' });
            data.name = name.trim();
        }
        if (Array.isArray(tracks)) data.tracks = tracks;

        const updated = await prisma.playlist.update({ where: { id }, data });
        res.json(updated);
    } catch (e) { next(e); }
};

export const deletePlaylist = async (req, res, next) => {
    try {
        const { id } = req.params;
        const playlist = await prisma.playlist.findUnique({ where: { id } });
        if (!playlist) return res.status(404).json({ message: 'Çalma listesi bulunamadı' });
        if (playlist.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.playlist.delete({ where: { id } });
        res.json({ ok: true });
    } catch (e) { next(e); }
};

export const addTrackToPlaylist = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { trackId, title, artist, imageUrl, streamUrl, duration } = req.body;
        if (!trackId || !title || !artist || !streamUrl) {
            return res.status(400).json({ message: 'trackId, title, artist, streamUrl zorunludur' });
        }
        const playlist = await prisma.playlist.findUnique({ where: { id } });
        if (!playlist) return res.status(404).json({ message: 'Çalma listesi bulunamadı' });
        if (playlist.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
        if (tracks.some(t => t.trackId === String(trackId))) {
            return res.status(409).json({ message: 'Bu şarkı zaten listede' });
        }
        tracks.push({ trackId: String(trackId), title, artist, imageUrl: imageUrl || null, streamUrl, duration: duration ?? null });

        const updated = await prisma.playlist.update({ where: { id }, data: { tracks } });
        res.json(updated);
    } catch (e) { next(e); }
};

export const removeTrackFromPlaylist = async (req, res, next) => {
    try {
        const { id, trackId } = req.params;
        const playlist = await prisma.playlist.findUnique({ where: { id } });
        if (!playlist) return res.status(404).json({ message: 'Çalma listesi bulunamadı' });
        if (playlist.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const tracks = (Array.isArray(playlist.tracks) ? playlist.tracks : []).filter(t => t.trackId !== trackId);
        const updated = await prisma.playlist.update({ where: { id }, data: { tracks } });
        res.json(updated);
    } catch (e) { next(e); }
};
