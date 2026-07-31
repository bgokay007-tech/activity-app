// Maç ilanı / turnuva "ekstra hizmetler" (DJ, sanatçı, mangal partisi vb.) — hem
// rival.controller.js hem tournament.controller.js create/update'inde kullanılır.
const VALID_TYPES = ['DJ', 'ARTIST', 'BBQ', 'OTHER'];

export function sanitizeExtraServices(raw) {
    if (!Array.isArray(raw)) return null; // geçersiz — çağıran 400 döner
    const cleaned = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') return null;
        const type = VALID_TYPES.includes(item.type) ? item.type : null;
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const price = Number.isFinite(Number(item.price)) ? Math.max(0, parseInt(item.price, 10)) : null;
        if (!type || !name || price === null) return null;
        cleaned.push({
            id: item.id || `${Date.now()}_${cleaned.length}`,
            type, name, price,
            ...(item.artistListingId ? { artistListingId: item.artistListingId } : {}),
        });
    }
    return cleaned;
}
