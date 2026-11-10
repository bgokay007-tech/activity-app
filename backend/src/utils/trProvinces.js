// Türkiye il sınırları — yaklaşık bbox (yürüyüş rotası filtrelemek için yeterli).
// Rota path'i bir il kutusuna düşüyorsa o il "provinces" listesine yazılır;
// "Antalya" aranınca Likya gibi çok-illi rotalar da Antalya kısmıyla listelenir.

const PROVINCES = [
    { name: 'Adana', minLat: 36.45, maxLat: 38.45, minLng: 34.75, maxLng: 36.65 },
    { name: 'Adıyaman', minLat: 37.40, maxLat: 38.15, minLng: 37.55, maxLng: 39.15 },
    { name: 'Afyonkarahisar', minLat: 37.95, maxLat: 39.25, minLng: 29.70, maxLng: 31.60 },
    { name: 'Ağrı', minLat: 39.15, maxLat: 40.15, minLng: 42.20, maxLng: 44.50 },
    { name: 'Aksaray', minLat: 37.95, maxLat: 39.05, minLng: 33.25, maxLng: 34.55 },
    { name: 'Amasya', minLat: 40.20, maxLat: 41.15, minLng: 35.20, maxLng: 36.55 },
    { name: 'Ankara', minLat: 39.00, maxLat: 40.75, minLng: 31.50, maxLng: 33.80 },
    { name: 'Antalya', minLat: 36.05, maxLat: 37.50, minLng: 29.15, maxLng: 32.60 },
    { name: 'Ardahan', minLat: 40.70, maxLat: 41.55, minLng: 42.25, maxLng: 43.35 },
    { name: 'Artvin', minLat: 40.75, maxLat: 41.55, minLng: 41.15, maxLng: 42.55 },
    { name: 'Aydın', minLat: 37.25, maxLat: 38.20, minLng: 27.20, maxLng: 28.80 },
    { name: 'Balıkesir', minLat: 39.05, maxLat: 40.65, minLng: 26.50, maxLng: 28.70 },
    { name: 'Bartın', minLat: 41.35, maxLat: 41.80, minLng: 32.15, maxLng: 32.90 },
    { name: 'Batman', minLat: 37.65, maxLat: 38.40, minLng: 40.90, maxLng: 41.70 },
    { name: 'Bayburt', minLat: 40.00, maxLat: 40.55, minLng: 39.70, maxLng: 40.65 },
    { name: 'Bilecik', minLat: 39.65, maxLat: 40.40, minLng: 29.55, maxLng: 30.55 },
    { name: 'Bingöl', minLat: 38.60, maxLat: 39.55, minLng: 40.15, maxLng: 41.25 },
    { name: 'Bitlis', minLat: 38.05, maxLat: 38.95, minLng: 41.55, maxLng: 43.05 },
    { name: 'Bolu', minLat: 40.20, maxLat: 41.05, minLng: 30.85, maxLng: 32.55 },
    { name: 'Burdur', minLat: 36.95, maxLat: 37.85, minLng: 29.45, maxLng: 30.75 },
    { name: 'Bursa', minLat: 39.55, maxLat: 40.65, minLng: 28.05, maxLng: 29.95 },
    { name: 'Çanakkale', minLat: 39.45, maxLat: 40.75, minLng: 25.65, maxLng: 27.55 },
    { name: 'Çankırı', minLat: 40.25, maxLat: 41.15, minLng: 32.95, maxLng: 34.25 },
    { name: 'Çorum', minLat: 39.85, maxLat: 41.15, minLng: 34.15, maxLng: 35.55 },
    { name: 'Denizli', minLat: 37.05, maxLat: 38.35, minLng: 28.50, maxLng: 30.05 },
    { name: 'Diyarbakır', minLat: 37.45, maxLat: 38.65, minLng: 39.55, maxLng: 41.25 },
    { name: 'Düzce', minLat: 40.65, maxLat: 41.15, minLng: 30.80, maxLng: 31.65 },
    { name: 'Edirne', minLat: 40.55, maxLat: 42.05, minLng: 26.10, maxLng: 27.20 },
    { name: 'Elazığ', minLat: 38.35, maxLat: 39.15, minLng: 38.55, maxLng: 40.35 },
    { name: 'Erzincan', minLat: 39.15, maxLat: 40.15, minLng: 38.40, maxLng: 40.55 },
    { name: 'Erzurum', minLat: 39.15, maxLat: 40.85, minLng: 40.50, maxLng: 42.55 },
    { name: 'Eskişehir', minLat: 39.10, maxLat: 40.25, minLng: 30.15, maxLng: 32.05 },
    { name: 'Gaziantep', minLat: 36.75, maxLat: 37.55, minLng: 36.55, maxLng: 38.05 },
    { name: 'Giresun', minLat: 40.15, maxLat: 41.15, minLng: 37.85, maxLng: 39.15 },
    { name: 'Gümüşhane', minLat: 39.85, maxLat: 40.65, minLng: 38.85, maxLng: 40.05 },
    { name: 'Hakkari', minLat: 37.05, maxLat: 37.85, minLng: 43.35, maxLng: 44.85 },
    { name: 'Hatay', minLat: 35.80, maxLat: 37.05, minLng: 35.75, maxLng: 36.85 },
    { name: 'Iğdır', minLat: 39.55, maxLat: 40.15, minLng: 43.55, maxLng: 44.65 },
    { name: 'Isparta', minLat: 37.45, maxLat: 38.55, minLng: 30.15, maxLng: 31.65 },
    { name: 'İstanbul', minLat: 40.80, maxLat: 41.55, minLng: 28.00, maxLng: 29.95 },
    { name: 'İzmir', minLat: 37.85, maxLat: 39.45, minLng: 26.20, maxLng: 28.55 },
    { name: 'Kahramanmaraş', minLat: 37.25, maxLat: 38.65, minLng: 36.15, maxLng: 37.85 },
    { name: 'Karabük', minLat: 40.85, maxLat: 41.55, minLng: 32.05, maxLng: 33.05 },
    { name: 'Karaman', minLat: 36.75, maxLat: 37.55, minLng: 32.55, maxLng: 34.15 },
    { name: 'Kars', minLat: 40.05, maxLat: 41.15, minLng: 42.35, maxLng: 43.75 },
    { name: 'Kastamonu', minLat: 41.05, maxLat: 42.05, minLng: 33.05, maxLng: 34.55 },
    { name: 'Kayseri', minLat: 37.85, maxLat: 39.25, minLng: 34.85, maxLng: 36.85 },
    { name: 'Kırıkkale', minLat: 39.45, maxLat: 40.15, minLng: 33.15, maxLng: 34.25 },
    { name: 'Kırklareli', minLat: 41.25, maxLat: 42.15, minLng: 26.85, maxLng: 28.05 },
    { name: 'Kırşehir', minLat: 38.85, maxLat: 39.75, minLng: 33.55, maxLng: 34.65 },
    { name: 'Kilis', minLat: 36.55, maxLat: 37.05, minLng: 36.75, maxLng: 37.55 },
    { name: 'Kocaeli', minLat: 40.55, maxLat: 41.25, minLng: 29.35, maxLng: 30.55 },
    { name: 'Konya', minLat: 36.75, maxLat: 39.45, minLng: 31.15, maxLng: 34.75 },
    { name: 'Kütahya', minLat: 38.85, maxLat: 39.85, minLng: 29.05, maxLng: 30.55 },
    { name: 'Malatya', minLat: 37.85, maxLat: 39.15, minLng: 37.55, maxLng: 39.15 },
    { name: 'Manisa', minLat: 38.25, maxLat: 39.45, minLng: 27.15, maxLng: 29.15 },
    { name: 'Mardin', minLat: 36.95, maxLat: 37.75, minLng: 40.15, maxLng: 42.05 },
    { name: 'Mersin', minLat: 36.05, maxLat: 37.45, minLng: 32.55, maxLng: 35.05 },
    { name: 'Muğla', minLat: 36.25, maxLat: 37.55, minLng: 27.15, maxLng: 29.55 },
    { name: 'Muş', minLat: 38.55, maxLat: 39.35, minLng: 41.05, maxLng: 42.55 },
    { name: 'Nevşehir', minLat: 38.35, maxLat: 39.15, minLng: 34.15, maxLng: 35.15 },
    { name: 'Niğde', minLat: 37.55, maxLat: 38.45, minLng: 34.15, maxLng: 35.25 },
    { name: 'Ordu', minLat: 40.45, maxLat: 41.25, minLng: 36.85, maxLng: 38.15 },
    { name: 'Osmaniye', minLat: 36.95, maxLat: 37.65, minLng: 35.85, maxLng: 36.65 },
    { name: 'Rize', minLat: 40.75, maxLat: 41.35, minLng: 40.25, maxLng: 41.15 },
    { name: 'Sakarya', minLat: 40.45, maxLat: 41.15, minLng: 30.05, maxLng: 30.95 },
    { name: 'Samsun', minLat: 40.75, maxLat: 41.65, minLng: 34.85, maxLng: 37.15 },
    { name: 'Siirt', minLat: 37.65, maxLat: 38.25, minLng: 41.55, maxLng: 42.75 },
    { name: 'Sinop', minLat: 41.35, maxLat: 42.15, minLng: 34.15, maxLng: 35.55 },
    { name: 'Sivas', minLat: 38.55, maxLat: 40.35, minLng: 35.85, maxLng: 38.85 },
    { name: 'Şanlıurfa', minLat: 36.55, maxLat: 38.05, minLng: 37.85, maxLng: 40.25 },
    { name: 'Şırnak', minLat: 37.15, maxLat: 37.85, minLng: 41.85, maxLng: 43.15 },
    { name: 'Tekirdağ', minLat: 40.65, maxLat: 41.55, minLng: 26.55, maxLng: 28.05 },
    { name: 'Tokat', minLat: 39.85, maxLat: 40.75, minLng: 35.85, maxLng: 37.55 },
    { name: 'Trabzon', minLat: 40.55, maxLat: 41.15, minLng: 39.15, maxLng: 40.55 },
    { name: 'Tunceli', minLat: 38.85, maxLat: 39.55, minLng: 39.05, maxLng: 40.15 },
    { name: 'Uşak', minLat: 38.25, maxLat: 38.95, minLng: 28.85, maxLng: 29.85 },
    { name: 'Van', minLat: 37.85, maxLat: 39.45, minLng: 42.55, maxLng: 44.55 },
    { name: 'Yalova', minLat: 40.50, maxLat: 40.75, minLng: 28.85, maxLng: 29.45 },
    { name: 'Yozgat', minLat: 39.15, maxLat: 40.25, minLng: 34.25, maxLng: 36.15 },
    { name: 'Zonguldak', minLat: 41.05, maxLat: 41.65, minLng: 31.35, maxLng: 32.25 },
];

export function normalizeTr(s) {
    return String(s || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function provinceAt(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    let best = null;
    let bestArea = Infinity;
    for (const p of PROVINCES) {
        if (lat < p.minLat || lat > p.maxLat || lng < p.minLng || lng > p.maxLng) continue;
        const area = (p.maxLat - p.minLat) * (p.maxLng - p.minLng);
        if (area < bestArea) { bestArea = area; best = p.name; }
    }
    return best;
}

/** Path parçalarından geçen illeri döner (örnekleyerek). */
export function provincesFromPath(path) {
    const segs = Array.isArray(path) ? (Array.isArray(path[0]) ? path : [path]) : [];
    const found = new Set();
    for (const seg of segs) {
        if (!Array.isArray(seg) || !seg.length) continue;
        const step = Math.max(1, Math.floor(seg.length / 40));
        for (let i = 0; i < seg.length; i += step) {
            const pt = seg[i];
            const lat = Number(pt?.lat);
            const lng = Number(pt?.lng ?? pt?.lon);
            const name = provinceAt(lat, lng);
            if (name) found.add(name);
        }
        const last = seg[seg.length - 1];
        const name = provinceAt(Number(last?.lat), Number(last?.lng ?? last?.lon));
        if (name) found.add(name);
    }
    return [...found];
}

/** Arama metninden eşleşen il adları (Antalya, "Antalya ili" vb.). */
export function findProvincesForQuery(q) {
    const n = normalizeTr(q);
    if (n.length < 3) return [];
    return PROVINCES.map((p) => p.name).filter((name) => {
        const pn = normalizeTr(name);
        if (pn === n) return true;
        if (n.length >= 4 && pn.startsWith(n)) return true;
        if (n === `${pn} ili` || n.startsWith(`${pn} `) || n.endsWith(` ${pn}`)) return true;
        return false;
    });
}

export const TR_PROVINCE_NAMES = PROVINCES.map((p) => p.name);
