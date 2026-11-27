import prisma from '../config/prisma.js';
import { fetchStoreProducts } from '../utils/equipmentStoreSync.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

function cleanUrl(u) {
    if (typeof u !== 'string') return '';
    const s = u.trim();
    if (!/^https?:\/\//i.test(s)) return '';
    return s.slice(0, 1000);
}

async function upsertSyncedProducts(storeId, products) {
    const now = new Date();
    let upserted = 0;
    for (const p of products) {
        await prisma.equipmentStoreProduct.upsert({
            where: {
                storeId_externalId: {
                    storeId,
                    externalId: p.externalId,
                },
            },
            create: {
                storeId,
                title: p.title,
                description: p.description,
                price: p.price,
                currency: p.currency || 'TRY',
                stock: p.stock,
                imageUrl: p.imageUrl,
                productUrl: p.productUrl,
                externalId: p.externalId,
                brand: p.brand ? String(p.brand).slice(0, 120) : null,
                status: p.stock === 0 ? 'OUT_OF_STOCK' : 'ACTIVE',
                syncedAt: now,
            },
            update: {
                title: p.title,
                description: p.description,
                price: p.price,
                currency: p.currency || 'TRY',
                stock: p.stock,
                imageUrl: p.imageUrl,
                productUrl: p.productUrl,
                brand: p.brand ? String(p.brand).slice(0, 120) : null,
                status: p.stock === 0 ? 'OUT_OF_STOCK' : 'ACTIVE',
                syncedAt: now,
            },
        });
        upserted += 1;
    }
    return upserted;
}

export const listStores = async (req, res, next) => {
    try {
        const { category, subCategory, q, city } = req.query;
        const qTrim = q && String(q).trim();
        const stores = await prisma.equipmentStore.findMany({
            where: {
                status: 'ACTIVE',
                ...(category && { category }),
                ...(subCategory && { subCategory }),
                ...(city && {
                    OR: [
                        { city: { contains: city, mode: 'insensitive' } },
                    ],
                }),
                ...(qTrim && {
                    OR: [
                        { name: { contains: qTrim, mode: 'insensitive' } },
                        { city: { contains: qTrim, mode: 'insensitive' } },
                    ],
                }),
            },
            include: {
                user: { select: USER_SELECT },
                _count: { select: { products: { where: { status: { in: ['ACTIVE', 'OUT_OF_STOCK'] } } } } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 100,
        });
        res.json(stores.map((s) => ({
            ...s,
            productCount: s._count?.products ?? 0,
            _count: undefined,
        })));
    } catch (err) { next(err); }
};

/** Mağazalara girmeden çapraz ürün arama + fiyat sıralama */
export const searchStoreProducts = async (req, res, next) => {
    try {
        const {
            category, subCategory, q, sort = 'price_asc',
            minPrice, maxPrice,
        } = req.query;
        const qTrim = q && String(q).trim();
        const minP = minPrice != null && minPrice !== '' ? parseInt(minPrice, 10) : null;
        const maxP = maxPrice != null && maxPrice !== '' ? parseInt(maxPrice, 10) : null;

        let orderBy = { price: 'asc' };
        if (sort === 'price_desc') orderBy = { price: 'desc' };
        else if (sort === 'newest') orderBy = { updatedAt: 'desc' };
        else if (sort === 'name') orderBy = { title: 'asc' };

        const priceFilter = {};
        if (minP != null && Number.isFinite(minP)) priceFilter.gte = minP;
        if (maxP != null && Number.isFinite(maxP)) priceFilter.lte = maxP;

        const products = await prisma.equipmentStoreProduct.findMany({
            where: {
                status: { in: ['ACTIVE', 'OUT_OF_STOCK'] },
                ...(Object.keys(priceFilter).length ? { price: priceFilter } : {}),
                ...(qTrim && {
                    OR: [
                        { title: { contains: qTrim, mode: 'insensitive' } },
                        { brand: { contains: qTrim, mode: 'insensitive' } },
                        { description: { contains: qTrim, mode: 'insensitive' } },
                    ],
                }),
                store: {
                    status: 'ACTIVE',
                    ...(category && { category }),
                    ...(subCategory && { subCategory }),
                },
            },
            include: {
                store: {
                    select: {
                        id: true, name: true, phone: true, websiteUrl: true,
                        city: true, logoUrl: true, subCategory: true,
                        user: { select: USER_SELECT },
                    },
                },
            },
            orderBy,
            take: 200,
        });
        res.json(products);
    } catch (err) { next(err); }
};

export const getStore = async (req, res, next) => {
    try {
        const store = await prisma.equipmentStore.findUnique({
            where: { id: req.params.id },
            include: {
                user: { select: USER_SELECT },
                products: {
                    where: { status: { in: ['ACTIVE', 'OUT_OF_STOCK'] } },
                    orderBy: { price: 'asc' },
                    take: 500,
                },
            },
        });
        if (!store || store.status !== 'ACTIVE') {
            return res.status(404).json({ message: 'Mağaza bulunamadı' });
        }
        res.json(store);
    } catch (err) { next(err); }
};

export const createStore = async (req, res, next) => {
    try {
        const {
            category, subCategory, name, phone, websiteUrl, feedUrl, city, logoUrl, syncNow,
        } = req.body;
        if (!category || !subCategory || !name || !String(name).trim()) {
            return res.status(400).json({ message: 'Mağaza adı ve dal zorunlu' });
        }
        const site = cleanUrl(websiteUrl);
        if (!site) {
            return res.status(400).json({ message: 'Geçerli bir https:// web sayfası gerekli' });
        }
        const feed = feedUrl ? cleanUrl(feedUrl) : null;

        const store = await prisma.equipmentStore.create({
            data: {
                userId: req.userId,
                category,
                subCategory,
                name: String(name).trim().slice(0, 120),
                phone: phone ? String(phone).replace(/[^\d+\s()-]/g, '').slice(0, 40) : null,
                websiteUrl: site,
                feedUrl: feed || null,
                city: city ? String(city).trim().slice(0, 80) : null,
                logoUrl: logoUrl ? String(logoUrl).slice(0, 1000) : null,
            },
            include: { user: { select: USER_SELECT } },
        });

        let sync = null;
        if (syncNow !== false) {
            try {
                const { products, source } = await fetchStoreProducts({
                    websiteUrl: store.websiteUrl,
                    feedUrl: store.feedUrl,
                });
                const count = await upsertSyncedProducts(store.id, products);
                await prisma.equipmentStore.update({
                    where: { id: store.id },
                    data: { lastSyncedAt: new Date() },
                });
                sync = { ok: true, count, source };
            } catch (e) {
                sync = { ok: false, message: e?.message || 'Senkron başarısız' };
            }
        }

        const full = await prisma.equipmentStore.findUnique({
            where: { id: store.id },
            include: {
                user: { select: USER_SELECT },
                _count: { select: { products: true } },
            },
        });
        res.status(201).json({
            ...full,
            productCount: full?._count?.products ?? 0,
            _count: undefined,
            sync,
        });
    } catch (err) { next(err); }
};

export const syncStore = async (req, res, next) => {
    try {
        const store = await prisma.equipmentStore.findUnique({ where: { id: req.params.id } });
        if (!store) return res.status(404).json({ message: 'Mağaza bulunamadı' });
        if (store.userId !== req.userId) {
            const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
            if (!me?.isAdmin) return res.status(403).json({ message: 'Yetkisiz' });
        }

        // Feed URL güncellemesi
        if (req.body?.feedUrl !== undefined) {
            const feed = req.body.feedUrl ? cleanUrl(req.body.feedUrl) : null;
            await prisma.equipmentStore.update({
                where: { id: store.id },
                data: { feedUrl: feed },
            });
            store.feedUrl = feed;
        }
        if (req.body?.websiteUrl) {
            const site = cleanUrl(req.body.websiteUrl);
            if (site) {
                await prisma.equipmentStore.update({
                    where: { id: store.id },
                    data: { websiteUrl: site },
                });
                store.websiteUrl = site;
            }
        }

        const { products, source } = await fetchStoreProducts({
            websiteUrl: store.websiteUrl,
            feedUrl: store.feedUrl,
        });
        const count = await upsertSyncedProducts(store.id, products);
        await prisma.equipmentStore.update({
            where: { id: store.id },
            data: { lastSyncedAt: new Date() },
        });
        res.json({ ok: true, count, source, lastSyncedAt: new Date() });
    } catch (err) {
        if (err?.tried) {
            return res.status(400).json({
                message: err.message || 'Senkron başarısız',
                tried: err.tried,
            });
        }
        next(err);
    }
};

export const deleteStore = async (req, res, next) => {
    try {
        const store = await prisma.equipmentStore.findUnique({ where: { id: req.params.id } });
        if (!store) return res.status(404).json({ message: 'Mağaza bulunamadı' });
        if (store.userId !== req.userId) {
            const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
            if (!me?.isAdmin) return res.status(403).json({ message: 'Yetkisiz' });
        }
        await prisma.equipmentStore.delete({ where: { id: store.id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};
