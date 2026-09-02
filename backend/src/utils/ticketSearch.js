// Bilet arama ortak yardımcıları — spor (sportsTicket), konser (concert) ve tiyatro (theater)
// controller'ları arasında paylaşılır. Aksi halde her biri kendi (birbirinden bağımsız,
// zamanla tutarsızlaşabilen) kopyasını tutardı — nitekim konser/tiyatro'da bu paylaşım
// olmadığı için sporda düzeltilen "tarihi geçmiş etkinlik" ve "aynı etkinlik tekrar tekrar
// görünüyor" bug'ları orada hâlâ vardı.

// Türkiye yerel bugünün tarihi (UTC+3) — YYYY-MM-DD.
export function todayTurkey() {
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // UTC+3'e kaydır
    return now.toISOString().slice(0, 10);
}

// İstemci daha ileri bir tarih isteyebilir ama asla bugünden geriye gidilemez — tarihi geçmiş
// etkinlikler bir daha hiç dönmesin diye sunucu HER ZAMAN en az bugünü zorluyor.
export function clampDateFrom(clientDateFrom) {
    const today = todayTurkey();
    return clientDateFrom && clientDateFrom > today ? clientDateFrom : today;
}

// Kullanıcı isteği: şehir filtresi kaynaklara olduğu gibi gönderiliyordu — "Antalya merkez"
// gibi kullanıcının kendi yazdığı bir değer venue veritabanındaki tam şehir adıyla (ör.
// "Antalya", Türkçe karaktersiz "Istanbul") eşleşmediği için hiç sonuç dönmüyordu. Burada
// "merkez/ilçe/il" gibi ekleri temizleyip Türkçe karakterleri ASCII karşılığına çeviriyoruz.
export function normalizeCityForSearch(city) {
    if (!city) return city;
    const TR_MAP = { 'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C' };
    let s = city.trim();
    s = s.replace(/\s+(merkez|il|ilçe)\.?$/i, '').trim();
    s = s.replace(/[ıİğĞüÜşŞöÖçÇ]/g, ch => TR_MAP[ch] || ch);
    return s || city;
}

// Aynı gerçek etkinlik farklı kaynaklarda (Ticketmaster/SeatGeek/ileride Biletix) AYRI birer
// satır olarak dönüp listede tekrar (bilgi kirliliği) yaratmasın diye — isim+tarih+şehir
// eşleşen olayları TEK satıra indirger. Kaynaklar arası ortak bir dış ID olmadığı için isim
// bazlı bulanık (fuzzy) eşleştirme kullanılıyor: Türkçe karakterler sadeleştirilip küçük harfe
// çevrilir, noktalama/boşluk farkları yok sayılır. Aynı grupta birden fazla kayıt varsa,
// fiyat bilgisi olan (priceMin dolu) tercih edilir; o da eşitse kaynak önceliğine göre ilki
// tutulur — kullanıcıya aynı etkinlik için 2-3 kez tekrar eden satır gösterilmez.
export function normalizeNameForDedup(name) {
    if (!name) return '';
    const TR_MAP = { 'ı': 'i', 'İ': 'i', 'ğ': 'g', 'Ğ': 'g', 'ü': 'u', 'Ü': 'u', 'ş': 's', 'Ş': 's', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c' };
    return name.toLowerCase()
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, ch => TR_MAP[ch] || ch)
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

const SOURCE_PRIORITY = { ticketmaster: 0, seatgeek: 1, biletix: 2 };

export function dedupeEvents(events) {
    const groups = new Map();
    for (const e of events) {
        const key = `${normalizeNameForDedup(e.name)}|${e.date || ''}|${normalizeNameForDedup(e.city)}`;
        const existing = groups.get(key);
        if (!existing) { groups.set(key, e); continue; }
        const existingHasPrice = existing.priceMin != null;
        const currentHasPrice = e.priceMin != null;
        if (currentHasPrice && !existingHasPrice) { groups.set(key, e); continue; }
        if (currentHasPrice === existingHasPrice) {
            const existingPriority = SOURCE_PRIORITY[existing.source] ?? 99;
            const currentPriority = SOURCE_PRIORITY[e.source] ?? 99;
            if (currentPriority < existingPriority) groups.set(key, e);
        }
    }
    return [...groups.values()];
}
