// MET (Metabolic Equivalent of Task) tabanlı tahmini kalori hesabı — saatten/telefon Sağlık
// uygulamasından gerçek veri gelmediğinde son çare olarak devreye girer (bkz. liveMatchEngine
// kullanan MatchLiveScreen'deki finishAndReport). Formül: kalori = MET × kilo(kg) × süre(saat).
// Kullanıcının kilosu tutulmadığı için (bkz. User modeli) cinsiyete göre kaba bir varsayılan
// kilo kullanılır — gerçek ölçüm yerine geçmez, sadece "≈ tahmini" olarak etiketlenir.
const MET_TABLE = {
    tennis: { COMPETITIVE: 8, PRACTICE: 6, BOTH: 7 },
    padel: { COMPETITIVE: 7, PRACTICE: 5, BOTH: 6 },
    table_tennis: { COMPETITIVE: 5, PRACTICE: 4, BOTH: 4.5 },
    badminton: { COMPETITIVE: 7, PRACTICE: 5.5, BOTH: 6 },
    volleyball: { COMPETITIVE: 6, PRACTICE: 4, BOTH: 5 },
    basketball: { COMPETITIVE: 8, PRACTICE: 6, BOTH: 7 },
};
const DEFAULT_WEIGHT_KG = { MALE: 75, FEMALE: 62, OTHER: 68 };

export function estimateCalories({ sport, matchMode, durationMinutes, gender }) {
    const table = MET_TABLE[sport];
    if (!table || !durationMinutes || durationMinutes <= 0) return null;
    const met = table[(matchMode || '').toUpperCase()] ?? table.PRACTICE;
    const weight = DEFAULT_WEIGHT_KG[gender] ?? DEFAULT_WEIGHT_KG.OTHER;
    return Math.round(met * weight * (durationMinutes / 60));
}
