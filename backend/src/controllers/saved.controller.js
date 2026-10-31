import prisma from '../config/prisma.js';

const POST_USER = { id: true, username: true, fullName: true, avatar: true };
const LIST_KIND_ORDER = { GENERAL: 0, CUSTOM: 1 };

async function ensureGeneralList(userId) {
    let list = await prisma.savedList.findFirst({
        where: { userId, kind: 'GENERAL' },
        include: { _count: { select: { items: true } } },
    });
    if (!list) {
        list = await prisma.savedList.create({ data: { userId, kind: 'GENERAL' } });
        list = { ...list, _count: { items: 0 } };
    }
    // Eski kayıtlar: Genel boşsa SavedItem'lardan bir kez doldur.
    if (list._count.items === 0) {
        const orphans = await prisma.savedItem.findMany({
            where: { userId, postId: { not: null } },
            select: { postId: true },
        });
        const ids = [...new Set(orphans.map(o => o.postId).filter(Boolean))];
        if (ids.length) {
            await prisma.savedListItem.createMany({
                data: ids.map(postId => ({ listId: list.id, postId })),
                skipDuplicates: true,
            });
        }
    }
    return list;
}

async function ownList(id, userId) {
    const list = await prisma.savedList.findUnique({ where: { id } });
    return list && list.userId === userId ? list : null;
}

async function upsertSavedItemForPost(userId, post) {
    const kind = post.type === 'REEL' ? 'REEL' : 'POST';
    return prisma.savedItem.upsert({
        where: { userId_saveKey: { userId, saveKey: `post:${post.id}` } },
        update: { kind, postId: post.id },
        create: { userId, kind, saveKey: `post:${post.id}`, postId: post.id },
    });
}

async function removePostFromAllLists(userId, postId) {
    const lists = await prisma.savedList.findMany({ where: { userId }, select: { id: true } });
    if (!lists.length) return;
    await prisma.savedListItem.deleteMany({
        where: { postId, listId: { in: lists.map(l => l.id) } },
    });
}

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
        const item = await upsertSavedItemForPost(req.userId, post);
        const general = await ensureGeneralList(req.userId);
        await prisma.savedListItem.upsert({
            where: { listId_postId: { listId: general.id, postId: post.id } },
            update: {},
            create: { listId: general.id, postId: post.id },
        });
        res.status(201).json(item);
    } catch (e) { next(e); }
};

export const unsavePost = async (req, res, next) => {
    try {
        await removePostFromAllLists(req.userId, req.params.postId);
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

export const getLists = async (req, res, next) => {
    try {
        await ensureGeneralList(req.userId);
        const postId = req.query.postId ? String(req.query.postId) : null;
        const lists = await prisma.savedList.findMany({
            where: { userId: req.userId },
            include: {
                _count: { select: { items: true } },
                ...(postId ? { items: { where: { postId }, select: { id: true } } } : {}),
            },
            orderBy: { createdAt: 'asc' },
        });
        res.json(lists
            .map(({ _count, items, ...l }) => ({
                ...l,
                itemCount: _count.items,
                ...(postId ? { hasPost: items.length > 0 } : {}),
            }))
            .sort((a, b) => LIST_KIND_ORDER[a.kind] - LIST_KIND_ORDER[b.kind]
                || String(a.name || '').localeCompare(String(b.name || ''))));
    } catch (e) { next(e); }
};

export const createList = async (req, res, next) => {
    try {
        const name = String(req.body.name || '').trim().slice(0, 60);
        if (!name) return res.status(400).json({ message: 'Liste adı zorunludur' });
        const count = await prisma.savedList.count({ where: { userId: req.userId } });
        if (count >= 50) return res.status(400).json({ message: 'En fazla 50 liste oluşturabilirsiniz' });
        const list = await prisma.savedList.create({
            data: { userId: req.userId, kind: 'CUSTOM', name },
        });
        res.status(201).json({ ...list, itemCount: 0 });
    } catch (e) { next(e); }
};

export const renameList = async (req, res, next) => {
    try {
        const list = await ownList(req.params.id, req.userId);
        if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });
        if (list.kind !== 'CUSTOM') return res.status(400).json({ message: 'Genel listenin adı değiştirilemez' });
        const name = String(req.body.name || '').trim().slice(0, 60);
        if (!name) return res.status(400).json({ message: 'Liste adı zorunludur' });
        res.json(await prisma.savedList.update({ where: { id: list.id }, data: { name } }));
    } catch (e) { next(e); }
};

export const deleteList = async (req, res, next) => {
    try {
        const list = await ownList(req.params.id, req.userId);
        if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });
        if (list.kind !== 'CUSTOM') return res.status(400).json({ message: 'Genel liste silinemez' });
        await prisma.savedList.delete({ where: { id: list.id } });
        res.json({ ok: true });
    } catch (e) { next(e); }
};

export const getList = async (req, res, next) => {
    try {
        const list = await ownList(req.params.id, req.userId);
        if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });
        const items = await prisma.savedListItem.findMany({
            where: { listId: list.id },
            orderBy: { createdAt: 'desc' },
            include: {
                post: { include: { user: { select: POST_USER }, _count: { select: { likes: true, comments: true } } } },
            },
        });
        res.json({
            ...list,
            items: items.map(i => ({
                id: i.id,
                postId: i.postId,
                createdAt: i.createdAt,
                kind: i.post?.type === 'REEL' ? 'REEL' : 'POST',
                post: i.post,
            })),
        });
    } catch (e) { next(e); }
};

export const addListItem = async (req, res, next) => {
    try {
        const list = await ownList(req.params.id, req.userId);
        if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });
        const postId = String(req.body.postId || '');
        const post = await prisma.post.findUnique({ where: { id: postId } });
        if (!post || post.type === 'STORY') return res.status(404).json({ message: 'Gönderi bulunamadı' });
        await upsertSavedItemForPost(req.userId, post);
        await prisma.savedListItem.upsert({
            where: { listId_postId: { listId: list.id, postId } },
            update: {},
            create: { listId: list.id, postId },
        });
        // Kategori listesine eklerken Genel'de de dursun — kaydedilenlerde genel + kategori.
        if (list.kind !== 'GENERAL') {
            const general = await ensureGeneralList(req.userId);
            await prisma.savedListItem.upsert({
                where: { listId_postId: { listId: general.id, postId } },
                update: {},
                create: { listId: general.id, postId },
            });
        }
        res.json({ ok: true });
    } catch (e) { next(e); }
};

export const removeListItem = async (req, res, next) => {
    try {
        const list = await ownList(req.params.id, req.userId);
        if (!list) return res.status(404).json({ message: 'Liste bulunamadı' });
        const postId = req.params.postId;
        await prisma.savedListItem.deleteMany({ where: { listId: list.id, postId } });

        if (list.kind === 'GENERAL') {
            // Genel'den çıkar = tüm listelerden ve kayıttan sil.
            await removePostFromAllLists(req.userId, postId);
            await prisma.savedItem.deleteMany({ where: { userId: req.userId, postId } });
        } else {
            // Sadece kategoriden çık; başka listede yoksa kaydı da silme — Genel'de kalır.
            const still = await prisma.savedListItem.count({
                where: {
                    postId,
                    list: { userId: req.userId },
                },
            });
            if (!still) {
                await prisma.savedItem.deleteMany({ where: { userId: req.userId, postId } });
            }
        }
        res.json({ ok: true });
    } catch (e) { next(e); }
};
