/**
 * Mağaza web sitesi / feed'den ürün çekme.
 * Destek:
 * 1) Özel JSON feed: [{ id, title, price, image, url, stock, brand, description }]
 * 2) Shopify: {origin}/products.json
 * 3) Basit { products: [...] } sarmalayıcı
 */

function toIntPrice(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v));
    const s = String(v).replace(/[^\d.,]/g, '').replace(',', '.');
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return 0;
    // 12.50 TL gibi → kuruşsuz tam sayı TL
    return Math.max(0, Math.round(n));
}

function normalizeProduct(raw, storeWebsite) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title || raw.name || raw.product_title || '').trim();
    if (!title) return null;
    const externalId = String(
        raw.id ?? raw.externalId ?? raw.sku ?? raw.handle ?? title,
    ).slice(0, 180);
    let imageUrl = raw.imageUrl || raw.image || raw.thumbnail || raw.featured_image
        || (Array.isArray(raw.images) ? (raw.images[0]?.src || raw.images[0]) : null)
        || null;
    if (typeof imageUrl === 'object' && imageUrl?.src) imageUrl = imageUrl.src;
    let productUrl = raw.productUrl || raw.url || raw.link || raw.permalink || null;
    if (!productUrl && raw.handle && storeWebsite) {
        try {
            const u = new URL(storeWebsite);
            productUrl = `${u.origin}/products/${raw.handle}`;
        } catch { /* */ }
    }
    const stockRaw = raw.stock ?? raw.inventory_quantity ?? raw.quantity ?? raw.qty;
    let stock = null;
    if (stockRaw != null && stockRaw !== '') {
        const sn = parseInt(stockRaw, 10);
        if (Number.isFinite(sn)) stock = sn;
    }
    // Shopify variants
    let price = raw.price;
    if (price == null && Array.isArray(raw.variants) && raw.variants[0]) {
        price = raw.variants[0].price;
        if (stock == null && raw.variants[0].inventory_quantity != null) {
            stock = parseInt(raw.variants[0].inventory_quantity, 10);
        }
    }
    return {
        externalId,
        title: title.slice(0, 200),
        description: raw.description ? String(raw.description).slice(0, 2000) : null,
        price: toIntPrice(price),
        currency: String(raw.currency || 'TRY').slice(0, 8),
        stock: Number.isFinite(stock) ? stock : null,
        imageUrl: imageUrl ? String(imageUrl).slice(0, 1000) : null,
        productUrl: productUrl ? String(productUrl).slice(0, 1000) : null,
        brand: raw.brand || raw.vendor || null,
    };
}

async function fetchJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            headers: {
                Accept: 'application/json,text/plain,*/*',
                'User-Agent': 'AcTiViTyStoreSync/1.0',
            },
            redirect: 'follow',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        return JSON.parse(text);
    } finally {
        clearTimeout(t);
    }
}

function extractList(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.products)) return data.products;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.data)) return data.data;
    return [];
}

function shopifyProductsUrl(websiteUrl) {
    try {
        const u = new URL(websiteUrl);
        return `${u.origin}/products.json?limit=250`;
    } catch {
        return null;
    }
}

/**
 * @returns {Promise<{ products: object[], source: string }>}
 */
export async function fetchStoreProducts({ websiteUrl, feedUrl }) {
    const tried = [];
    const candidates = [];
    if (feedUrl && /^https?:\/\//i.test(feedUrl)) candidates.push({ url: feedUrl.trim(), source: 'feed' });
    if (websiteUrl && /^https?:\/\//i.test(websiteUrl)) {
        const shop = shopifyProductsUrl(websiteUrl.trim());
        if (shop) candidates.push({ url: shop, source: 'shopify' });
        // Bazı siteler /api/products.json kullanır
        try {
            const u = new URL(websiteUrl.trim());
            candidates.push({ url: `${u.origin}/api/products.json`, source: 'api' });
        } catch { /* */ }
    }

    let lastErr = null;
    for (const c of candidates) {
        tried.push(c.url);
        try {
            const data = await fetchJson(c.url);
            const list = extractList(data);
            const products = list
                .map((row) => normalizeProduct(row, websiteUrl))
                .filter(Boolean)
                .slice(0, 500);
            if (products.length > 0) {
                return { products, source: c.source, tried };
            }
        } catch (e) {
            lastErr = e;
        }
    }

    const err = new Error(
        lastErr?.message
            || 'Web sitesinden ürün çekilemedi. JSON feed URL ekleyin veya Shopify mağaza adresi kullanın.',
    );
    err.tried = tried;
    throw err;
}
