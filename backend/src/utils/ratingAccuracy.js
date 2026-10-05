// ELO/UTR puanının "doğruluk oranı" — puan, oyuncunun gerçek maç sonuçlarını ne kadar iyi açıklıyor?
//
// utrRating.js'teki lojistik beklenen-sonuç eğrisi tersine işletilir: her maçta rakip puanı +
// kazanılan oyun oranından "bu maçta hangi seviyede oynadı" (ima edilen puan) çıkarılır ve maç
// öncesi puanla karşılaştırılır. Fark (artık) puan biriminde bir hata ölçüsüdür:
//   - ortalama artık ≈ 0  → puan yanlı değil (kalibrasyon iyi)
//   - artıkların standart hatası küçük → puan kesin (güven aralığı dar)
//   - etkin maç sayısı yüksek → yeterli kanıt var
// Ağırlıklar UTR recompute'u ile aynı mantık: zaman-aşımı × rakip güvenilirliği × format.
// Az maçta varyans tahmini oynak olduğu için önsel bir standart sapmaya (PRIOR_SD) doğru
// çekilir — 1 maçla "%100 kesin" çıkmasın diye.

const D = 0.6;               // utrRating.js ile aynı eğri dikliği (0-5 skala)
const WINDOW_DAYS = 365;
const PRIOR_SD = 0.8;        // maç başı ima-edilen-puan saçılımı için önsel (puan birimi)
const PRIOR_N = 2;           // önselin kaç maç değerinde sayılacağı
const BIAS_ZERO_AT = 0.6;    // 0.6 puan yanlılık → kalibrasyon puanı 0
const WIN_Z_ZERO_AT = 3;     // beklenen/gerçek galibiyet farkı 3 standart sapma → 0
const CI_ZERO_AT = 1.5;      // ±1.5 puanlık %95 güven aralığı → kesinlik puanı 0
const SAMPLE_SCALE = 6;      // etkin maç sayısı ölçeği (6 maç ≈ %63, 15 maç ≈ %92)

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const expectedScore = (rating, oppRating) => 1 / (1 + Math.pow(10, -(rating - oppRating) / D));

const impliedRating = (oppRating, perf) => {
    const p = clamp(perf, 0.02, 0.98);
    return oppRating + D * Math.log10(p / (1 - p));
};

// records: [{ date, result: 'win'|'loss'|'draw', perf: 0-1|null, ratingBefore, oppRating, reliability?: 0-1, formatWeight?: 0-1 }]
export function computeRatingAccuracy(records, currentRating, now = new Date()) {
    const rows = [];
    for (const r of records || []) {
        if (r.ratingBefore == null || r.oppRating == null || !r.result) continue;
        const age = (now.getTime() - new Date(r.date).getTime()) / 86400000;
        const decay = Math.max(0, 1 - age / WINDOW_DAYS);
        if (decay <= 0) continue;
        const w = decay * clamp(r.reliability ?? 1, 0.1, 1) * clamp(r.formatWeight ?? 1, 0.2, 1);
        const outcome = r.result === 'win' ? 1 : r.result === 'loss' ? 0 : 0.5;
        // Skor yoksa utrRating.js'teki 0.75/0.25 fallback'i ile aynı.
        const perf = r.perf != null ? r.perf : (r.result === 'win' ? 0.75 : r.result === 'loss' ? 0.25 : 0.5);
        rows.push({
            w,
            outcome,
            E: expectedScore(r.ratingBefore, r.oppRating),
            residual: impliedRating(r.oppRating, perf) - r.ratingBefore,
        });
    }
    if (rows.length === 0) return null;

    const sw = rows.reduce((a, x) => a + x.w, 0);
    const sw2 = rows.reduce((a, x) => a + x.w * x.w, 0);
    if (sw <= 0) return null;
    const nEff = (sw * sw) / sw2;
    const bias = rows.reduce((a, x) => a + x.w * x.residual, 0) / sw;
    const varObs = rows.reduce((a, x) => a + x.w * (x.residual - bias) ** 2, 0) / sw;
    const varPost = (varObs * nEff + PRIOR_SD ** 2 * PRIOR_N) / (nEff + PRIOR_N);
    const se = Math.sqrt(varPost / nEff);
    const ci95 = 1.96 * se;

    const brier = rows.reduce((a, x) => a + x.w * (x.E - x.outcome) ** 2, 0) / sw;
    const decisive = rows.filter(x => x.outcome !== 0.5 && Math.abs(x.E - 0.5) > 0.02);
    const hits = decisive.filter(x => (x.E > 0.5) === (x.outcome === 1)).length;
    const expectedWins = rows.reduce((a, x) => a + x.E, 0);
    const actualWins = rows.reduce((a, x) => a + x.outcome, 0);

    // Galibiyet sayısı binom: Var = Σ E(1−E). Fark kaç standart sapma (z) → puan galibiyetleri
    // ne kadar iyi öngörüyor. Oyun oranından bağımsız ikinci bir kanıt (skor girilmemiş maçlarda da çalışır).
    const winVar = rows.reduce((a, x) => a + x.E * (1 - x.E), 0);
    const winZ = Math.abs(actualWins - expectedWins) / Math.sqrt(Math.max(winVar, 0.05));

    const calibration = clamp(1 - Math.abs(bias) / BIAS_ZERO_AT, 0, 1);
    const winFit = clamp(1 - winZ / WIN_Z_ZERO_AT, 0, 1);
    const precision = clamp(1 - ci95 / CI_ZERO_AT, 0, 1);
    const sample = 1 - Math.exp(-nEff / SAMPLE_SCALE);
    const accuracy = Math.round(100 * (0.3 * calibration + 0.25 * winFit + 0.3 * precision + 0.15 * sample));

    // Yanlılık hem güven aralığından hem 0.15 eşiğinden büyükse anlamlı say — küçük örneklemde
    // tek bir sürpriz sonuç "puanın yanlış" demesin.
    const verdict = Math.abs(bias) > Math.max(ci95, 0.15)
        ? (bias > 0 ? 'underrated' : 'overrated')
        : winZ > 2 && rows.length >= 5
            ? (actualWins > expectedWins ? 'underrated' : 'overrated')
            : 'accurate';

    const r2 = (v) => parseFloat(v.toFixed(2));
    return {
        accuracy,
        grade: accuracy >= 85 ? 'very_high' : accuracy >= 70 ? 'high' : accuracy >= 50 ? 'medium' : 'low',
        verdict,
        matches: rows.length,
        effectiveMatches: r2(nEff),
        currentRating: currentRating != null ? r2(currentRating) : null,
        bias: r2(bias),
        ci95: r2(ci95),
        estimatedRating: currentRating != null ? r2(clamp(currentRating + bias, 0, 5)) : null,
        components: {
            calibration: Math.round(calibration * 100),
            winFit: Math.round(winFit * 100),
            precision: Math.round(precision * 100),
            sample: Math.round(sample * 100),
        },
        brier: parseFloat(brier.toFixed(3)),
        hitRate: decisive.length ? Math.round((hits / decisive.length) * 100) : null,
        hitSample: decisive.length,
        expectedWins: r2(expectedWins),
        actualWins: r2(actualWins),
    };
}
