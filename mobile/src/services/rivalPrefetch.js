import api from './api';

// Bildirim/deep-link → SubCategory arası: /rivals/:id navigasyondan ÖNCE başlar,
// ekran 7 liste API'sini beklerken detay zaten hazır olsun (tenis NEW_LISTING gecikmesi).
const inflight = new Map();

export function prefetchRival(id) {
    if (!id) return null;
    const key = String(id);
    if (inflight.has(key)) return inflight.get(key);
    const p = api.get(`/rivals/${key}`)
        .then((r) => r.data || null)
        .catch(() => null)
        .finally(() => {
            // 20sn sonra düş — tekrar tıklamada taze çekilsin
            setTimeout(() => {
                if (inflight.get(key) === p) inflight.delete(key);
            }, 20000);
        });
    inflight.set(key, p);
    return p;
}

export function takePrefetchedRival(id) {
    if (!id) return null;
    return inflight.get(String(id)) || null;
}
