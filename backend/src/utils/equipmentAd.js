/** Ekipman / mağaza reklamı — günlük başlangıç fiyatı (TRY). Şirket IBAN sonra doldurulacak. */
export const EQUIP_AD_DAILY_PRICE_TRY = 5;

export function cleanAdUrl(u) {
    if (typeof u !== 'string') return '';
    const s = u.trim();
    if (!/^https?:\/\//i.test(s)) return '';
    return s.slice(0, 1000);
}

export function cleanAdImages(arr, max = 8) {
    if (!Array.isArray(arr)) return [];
    return arr.filter((u) => typeof u === 'string' && u.trim()).map((u) => u.trim().slice(0, 1000)).slice(0, max);
}

export function parseAdDays(raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return 0;
    return Math.min(n, 365);
}

/** Ödeme bildirimi sonrası aktifleştir (EFT doğrulama şirket açılınca). */
export function buildActiveAdFields({ wantAd, adUrl, adImages, adDays }) {
    if (!wantAd) {
        return {
            isAd: false,
            adUrl: null,
            adImages: [],
            adDays: null,
            adStatus: 'NONE',
            adPaidUntil: null,
            adAmount: null,
        };
    }
    const days = parseAdDays(adDays) || 1;
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return {
        isAd: true,
        adUrl: cleanAdUrl(adUrl) || null,
        adImages: cleanAdImages(adImages),
        adDays: days,
        adStatus: 'ACTIVE',
        adPaidUntil: until,
        adAmount: days * EQUIP_AD_DAILY_PRICE_TRY,
    };
}

export function validateWantAd({ adUrl, adImages, adDays }) {
    const days = parseAdDays(adDays);
    if (!days) return 'Reklam süresi en az 1 gün olmalı';
    const url = cleanAdUrl(adUrl);
    if (!url) return 'Reklam için geçerli bir https:// site linki gerekli';
    if (cleanAdImages(adImages).length === 0) return 'Reklam için en az 1 görsel ekleyin';
    return null;
}
