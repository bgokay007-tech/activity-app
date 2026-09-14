// UTR puanlama motorunun VERİTABANISIZ modeli — simülasyon script'leri için.
//
// Puanlama mantığı burada YENİDEN YAZILMAZ: utrRating.js'in dışa açtığı saf fonksiyonlar
// (computeMatchPerformance / computeGapWeight / computeReliabilityWeight / computeDecayWeight /
// computeMatchWeight) birebir kullanılır. Sadece recomputeRatingFromHistory'nin Prisma'ya
// giden kısmı — kayan pencere ağırlıklı ortalaması — bellekteki kayıtlar üzerinde tekrarlanır.
//
// Bu modelin gerçek motorla aynı sonucu verdiği, simulateTennisMatchesE2E.js'in B2 bölümünde
// her maç için otomatik karşılaştırılıp raporlanır (sapma > 0.005 ise FAIL).
import {
    computeMatchPerformance, computeGapWeight, computeReliabilityWeight,
    computeDecayWeight, computeMatchWeight, clampPerformanceByOutcome, UTR_SUBCATEGORIES,
} from '../../src/utils/utrRating.js';

// utrRating.js içinde modül-içi (export edilmemiş) sabitlerin aynısı.
export const WINDOW_MAX_MATCHES = 30;
export const SEED_CONVERGE_MATCHES = 10;
export const SEED_WEIGHT_FLOOR = 0.1;
export const GRACE_MATCHES = 3;
export const GRACE_RATING_GAP = 1.0;

export const r4 = (v) => parseFloat(Number(v).toFixed(4));
export const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export const range = (from, to, step) => {
    const out = [];
    for (let v = from; v <= to + 1e-9; v += step) out.push(parseFloat(v.toFixed(2)));
    return out;
};

// --sub=padel gibi bir seçeneği doğrular. Tenis ve padel AYNI puanlama motorunu kullanıyor
// (utrRating.js UTR_SUBCATEGORIES) — skor şekli de aynı, yani her simülasyon ikisinde de
// olduğu gibi çalışır. UTR dışı bir dal verilirse (badminton/voleybol) script anlamsız
// sonuç üretmek yerine durur: o dallar eski skillRating yolundan geçiyor.
export function pickSub(value) {
    if (!UTR_SUBCATEGORIES.includes(value)) {
        console.error(`DURDURULDU: '${value}' UTR dalı değil. Seçenekler: ${UTR_SUBCATEGORIES.join(', ')}`);
        process.exit(1);
    }
    return value;
}

// Gerçek girdiyle aynı şekil ({sets:[{sender,opponent}]}) — oyun oranı ve set sayısından
// gelen format ağırlığı gerçek maçla birebir aynı hesaplanır.
export const SCORES = [
    { key: 'ezici_2set',     label: '6-0 6-1 (2 set, ezici)',     sets: [{ sender: 6, opponent: 0 }, { sender: 6, opponent: 1 }] },
    { key: 'rekabetci_2set', label: '6-4 7-5 (2 set, rekabetçi)', sets: [{ sender: 6, opponent: 4 }, { sender: 7, opponent: 5 }] },
    { key: 'cekismeli_3set', label: '6-4 4-6 7-6 (3 set)',        sets: [{ sender: 6, opponent: 4 }, { sender: 4, opponent: 6 }, { sender: 7, opponent: 6 }] },
    { key: 'tek_set',        label: '6-3 (tek set)',              sets: [{ sender: 6, opponent: 3 }] },
];

// Kazanan tarafın oyun oranı + set sayısından format ağırlığı.
export function perfFromScore(score) {
    let mine = 0, total = 0;
    for (const s of score.sets) { mine += s.sender; total += s.sender + s.opponent; }
    const ratio = total === 0 ? null : mine / total;
    return {
        winnerPerf: ratio ?? 0.75,
        loserPerf: ratio != null ? 1 - ratio : 0.25,
        formatWeight: Math.min(1.0, 0.5 + 0.25 * (score.sets.length - 1)),
    };
}

// recomputeRatingFromHistory'nin bellekteki eşleniği.
export function recompute(records, seedRating, now = new Date()) {
    const used = records.slice(-WINDOW_MAX_MATCHES);
    let weightedSum = 0, weightTotal = 0;
    for (const rec of used) {
        const decayWeight = computeDecayWeight(rec.matchDate, now);
        if (decayWeight <= 0) continue;
        const weight = computeMatchWeight({
            formatWeight: rec.formatWeight,
            gapWeight: computeGapWeight(rec.opponentRatingSnapshot != null ? (rec.ratingBefore - rec.opponentRatingSnapshot) : 0),
            reliabilityWeight: rec.opponentReliabilitySnapshot,
            decayWeight,
        });
        weightedSum += weight * clampPerformanceByOutcome(
            computeMatchPerformance(rec.opponentRatingSnapshot, rec.performanceScore),
            rec.didWin, rec.ratingBefore,
        );
        weightTotal += weight;
    }
    const seed = seedRating ?? 0;
    const seedWeight = Math.max(SEED_WEIGHT_FLOOR, 1 - used.length / SEED_CONVERGE_MATCHES);
    const raw = (seedWeight * seed + weightedSum) / (seedWeight + weightTotal);
    return r4(Math.min(5, Math.max(0, raw)));
}

// Gerçek UserInterest alanlarının simülasyon karşılığı. graceMatches: anketten sonra
// oynanmış maç sayısı — GRACE_MATCHES ve üstü ise kalibrasyon koruması kapanmış olur.
export const mkPlayer = (seed, { matchCount = 0, lastMatchAt = null, graceMatches = GRACE_MATCHES } = {}) => ({
    seed,
    rating: seed,
    records: [],
    matchCount,
    lastMatchAt,
    matchesSinceAssessment: graceMatches,
});

// Bir maçı oynatır — utrRating.js'teki runUtrMatch ile aynı sırayı izler: taraf ortalamaları →
// güvenilirlik → kalibrasyon koruması → kayıt ekle → geçmişten yeniden hesapla.
export function playMatch(winners, losers, score, { now = new Date() } = {}) {
    const winAvg = avg(winners.map(p => p.rating));
    const loseAvg = avg(losers.map(p => p.rating));
    const rel = (list) => avg(list.map(p => computeReliabilityWeight(p.matchCount, p.lastMatchAt, now)));
    const winnerReliability = rel(winners);
    const loserReliability = rel(losers);

    // Kalibrasyon koruması (getUtrReassessmentFlags): kazanan taraf ortalaması, kaybedenden
    // ≥1.0 DÜŞÜKSE ve kazananın anket sonrası maç sayısı 3'ten azsa maç ELO'ya HİÇ sayılmaz.
    const flagged = (winAvg < loseAvg && (loseAvg - winAvg) >= GRACE_RATING_GAP)
        ? winners.filter(p => p.matchesSinceAssessment < GRACE_MATCHES)
        : [];
    if (flagged.length > 0) {
        for (const p of [...winners, ...losers]) { p.matchCount += 1; p.lastMatchAt = now; }
        return { skipped: true, changes: [] };
    }

    const { winnerPerf, loserPerf, formatWeight } = perfFromScore(score);
    const changes = [];
    const step = (p, didWin, perf, oppRating, oppRel) => {
        const before = p.rating;
        p.records.push({
            matchDate: now, formatWeight, ratingBefore: before, didWin,
            opponentRatingSnapshot: oppRating, opponentReliabilitySnapshot: oppRel,
            performanceScore: perf,
        });
        p.rating = recompute(p.records, p.seed, now);
        p.matchCount += 1;
        p.lastMatchAt = now;
        p.matchesSinceAssessment += 1;
        changes.push({ didWin, before: r4(before), after: p.rating, change: r4(p.rating - before) });
    };
    for (const p of winners) step(p, true, winnerPerf, loseAvg, loserReliability);
    for (const p of losers) step(p, false, loserPerf, winAvg, winnerReliability);
    return { skipped: false, changes };
}

// Tek maçlık kısayol: sıfır geçmişli iki taraf, tek maç, sonuç puanları. Gerçek motordan
// okunan değerlerle karşılaştırmak için kullanılır (B2, C1).
//
// matchCount/lastMatchAt gerçek oyuncunun maç ANINDAKİ durumundan verilmeli — bunlar
// computeReliabilityWeight üzerinden ağırlığı belirliyor, varsayılana bırakılırsa model
// gerçek motordan sapar.
export function predictSingleMatch(winnerSeeds, loserSeeds, score, {
    graceMatches = GRACE_MATCHES, matchCount = 0, lastMatchAt = null,
} = {}) {
    const opts = { graceMatches, matchCount, lastMatchAt };
    const winners = winnerSeeds.map(s => mkPlayer(s, opts));
    const losers = loserSeeds.map(s => mkPlayer(s, opts));
    const res = playMatch(winners, losers, score);
    return {
        skipped: res.skipped,
        winnerAfter: winners.map(p => p.rating),
        loserAfter: losers.map(p => p.rating),
    };
}

export function writeCsv(dir, name, rows, fs, path) {
    if (rows.length === 0) return null;
    fs.mkdirSync(dir, { recursive: true });
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
        const s = String(v ?? '');
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Excel (TR) ';' ayırıcı bekliyor — 'sep=' satırı + BOM ile kolonlar doğru dağılır.
    const body = ['sep=;', cols.join(';'), ...rows.map(r => cols.map(c => esc(r[c])).join(';'))].join('\n');
    const file = path.join(dir, name);
    fs.writeFileSync(file, '\uFEFF' + body, 'utf8');
    return file;
}
