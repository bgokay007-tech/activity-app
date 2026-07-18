// VAR_DURATION kortlarda, işletmecinin belirlediği fiyat sınırları slot ızgarasıyla hizalı
// olmak zorunda değildir (ör. gün batımına göre 20:30 gibi). Backend her pencere için
// priceSegments (o pencere içinde fiyatın değiştiği alt aralıklar) döner — burada seçilen
// [startTime, startTime+durationMins) aralığını bu segmentlere göre süre ağırlıklı toplayıp
// gerçek karışım fiyatını hesaplıyoruz (ör. 20:00-21:00, sınır 20:30 → 30dk*400 + 30dk*500).
const toM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export function computeVarDurationPrice(win, startTime, durationMins) {
    const segments = win?.priceSegments;
    if (!Array.isArray(segments) || segments.length === 0) {
        const base = win?.pricePerHour;
        return { price: base != null ? Math.round(base * (durationMins / 60)) : null, priceByMethod: undefined };
    }
    const s = toM(startTime), e = s + durationMins;
    let total = 0;
    const totalByMethod = {};
    for (const seg of segments) {
        const segS = toM(seg.from), segE = toM(seg.to);
        const os = Math.max(s, segS), oe = Math.min(e, segE);
        if (oe <= os) continue;
        const hrs = (oe - os) / 60;
        total += seg.pricePerHour * hrs;
        if (seg.pricePerHourByMethod) {
            for (const method of Object.keys(seg.pricePerHourByMethod)) {
                totalByMethod[method] = (totalByMethod[method] || 0) + seg.pricePerHourByMethod[method] * hrs;
            }
        }
    }
    const priceByMethod = Object.keys(totalByMethod).length
        ? Object.fromEntries(Object.entries(totalByMethod).map(([k, v]) => [k, Math.round(v)]))
        : undefined;
    return { price: Math.round(total), priceByMethod };
}
