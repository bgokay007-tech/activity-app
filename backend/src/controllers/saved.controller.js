import prisma from '../config/prisma.js';

const POST_USER = { id: true, username: true, fullName: true, avatar: true };

export const listSaved = async (req, res, next) => {
    try {
        const kind = String(req.query.kind || '').toUpperCase();
        const musicKey = req.query.musicKey ? `music:${req.query.musicKey}` : null;
        const items = await prisma.savedItem.findMany({
            where: {
                userId: req.userId,
                ...(kind ? { kind } : {}),
                ...(musicKey ? { saveKey: musicKey } : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: {
                post: { include: { user: { select: POST_USER } } },
            },
        });
        res.json(items);
    } catch (e) { next(e); }
};

export const savedIds = async (req, res, next) => {
    try {
        const rows = await prisma.savedItem.findMany({
            where: { userId: req.userId, postId: { not: null } },
            select: { postId: true },
        });
        res.json({ postIds: rows.map(r => r.postId) });
    } catch (e) { next(e); }
};

export const savePost = async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
        if (!post || post.type === 'STORY') return res.status(404).json({ message: 'Gönderi bulunamadı' });
        const kind = post.type === 'REEL' ? 'REEL' : 'POST';
        const item = await prisma.savedItem.upsert({
            where: { userId_saveKey: { userId: req.userId, saveKey: `post:${post.id}` } },
            update: { kind, postId: post.id },
            create: { userId: req.userId, kind, saveKey: `post:${post.id}`, postId: post.id },
        });
        res.status(201).json(item);
    } catch (e) { next(e); }
};

export const unsavePost = async (req, res, next) => {
    try {
        await prisma.savedItem.deleteMany({ where: { userId: req.userId, postId: req.params.postId } });
        res.json({ ok: true });
    } catch (e) { next(e); }
};

export const saveMusic = async (req, res, next) => {
    try {
        const { musicUrl, musicName, musicArtist, musicCoverUrl, musicStartTime, musicEndTime } = req.body || {};
        if (!musicUrl || !musicName) return res.status(400).json({ message: 'Müzik bilgisi eksik' });
        const item = await prisma.savedItem.upsert({
            where: { userId_saveKey: { userId: req.userId, saveKey: `music:${musicUrl}` } },
            update: {
                musicName: String(musicName),
                musicArtist: musicArtist || null,
                musicCoverUrl: musicCoverUrl || null,
                musicStartTime: musicStartTime != null ? Number(musicStartTime) : null,
                musicEndTime: musicEndTime != null ? Number(musicEndTime) : null,
            },
            create: {
                userId: req.userId,
                kind: 'MUSIC',
                saveKey: `music:${musicUrl}`,
                musicUrl: String(musicUrl),
                musicName: String(musicName),
                musicArtist: musicArtist || null,
                musicCoverUrl: musicCoverUrl || null,
                musicStartTime: musicStartTime != null ? Number(musicStartTime) : null,
                musicEndTime: musicEndTime != null ? Number(musicEndTime) : null,
            },
        });
        res.status(201).json(item);
    } catch (e) { next(e); }
};

export const unsaveMusic = async (req, res, next) => {
    try {
        await prisma.savedItem.deleteMany({ where: { userId: req.userId, id: req.params.id, kind: 'MUSIC' } });
        res.json({ ok: true });
    } catch (e) { next(e); }
};
