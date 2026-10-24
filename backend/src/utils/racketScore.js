// Tenis / padel / pickleball set skoru.
// Set tiebreak: set 7-6 biter, parantez içindeki sayılar (7 sayı, 2 fark) ayrı tutulur.
// Maç tiebreak: yalnızca "2 normal set + 3. set tiebreak" kuralında, setler 1-1 ise
// 3. satır 10 sayıya (2 fark) oynanır. Bu satırın sayıları oyun averajına girmez.

export const RACKET_SET_SPORTS = ['tennis', 'padel', 'pickleball'];

export const isRacketSetSport = (sub) => RACKET_SET_SPORTS.includes(sub);

export function isSevenSix(a, b) {
    return Math.max(a, b) === 7 && Math.min(a, b) === 6;
}

export function setGamesValid(a, b) {
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
}

// min sayıya, en az 2 fark. min'de bittiyse kaybeden min-2'yi geçemez;
// uzadıysa fark tam 2 olmalı (8-5 gibi ara skor set bitmiş sayılmaz).
export function pointsValid(a, b, min) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return false;
    const hi = Math.max(a, b), lo = Math.min(a, b);
    if (hi < min) return false;
    if (hi === min) return lo <= min - 2;
    return hi - lo === 2;
}

function numOrNull(v) {
    if (v === '' || v == null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
}

/**
 * @returns {{ ok: true, sets: object[], winner: 'a'|'b' } | { ok: false, message: string }}
 */
export function normalizeRacketSets(raw, { decidingTiebreak = false, a = 'p1', b = 'p2', tbA = 'tb1', tbB = 'tb2' } = {}) {
    if (!Array.isArray(raw) || raw.length === 0) {
        return { ok: false, message: 'En az bir set skoru girin.' };
    }
    const parsed = [];
    for (const s of raw) {
        const av = numOrNull(s?.[a]);
        const bv = numOrNull(s?.[b]);
        if (av == null && bv == null) continue;
        const ga = av || 0, gb = bv || 0;
        if (ga === 0 && gb === 0) continue;
        parsed.push({
            a: ga, b: gb,
            tbA: numOrNull(s?.[tbA]),
            tbB: numOrNull(s?.[tbB]),
            matchTiebreak: !!s?.matchTiebreak,
        });
    }
    if (!parsed.length) return { ok: false, message: 'En az bir set skoru girin.' };

    const out = [];
    for (let i = 0; i < parsed.length; i++) {
        const s = parsed[i];
        let w1 = 0, w2 = 0;
        for (let j = 0; j < i; j++) {
            if (parsed[j].a > parsed[j].b) w1++;
            else if (parsed[j].b > parsed[j].a) w2++;
        }
        const splitDecider = !!decidingTiebreak && i === 2 && w1 === 1 && w2 === 1;
        if (s.matchTiebreak || splitDecider) {
            if (!splitDecider) {
                return { ok: false, message: 'Tiebreak satırı yalnızca setler 1-1 iken 3. satır olabilir.' };
            }
            if (!pointsValid(s.a, s.b, 10)) {
                return { ok: false, message: `${s.a}-${s.b} geçersiz maç tiebreak’i. 10 sayıya, en az 2 fark şart (ör. 10-8).` };
            }
            out.push({ [a]: s.a, [b]: s.b, matchTiebreak: true });
            continue;
        }
        if (!setGamesValid(s.a, s.b)) {
            return { ok: false, message: `${s.a}-${s.b} geçersiz set. Kazanan 6 (en fazla 6-4) veya 7-5 / 7-6 ile bitmeli.` };
        }
        const row = { [a]: s.a, [b]: s.b };
        if (isSevenSix(s.a, s.b)) {
            if (s.tbA == null || s.tbB == null) {
                return { ok: false, message: '7-6 için parantez içine tiebreak sayısını da girin.' };
            }
            if (!pointsValid(s.tbA, s.tbB, 7)) {
                return { ok: false, message: `${s.tbA}-${s.tbB} geçersiz set tiebreak’i. 7 sayıya, en az 2 fark şart.` };
            }
            if ((s.a > s.b) !== (s.tbA > s.tbB)) {
                return { ok: false, message: 'Seti alan tarafın tiebreak sayısı daha yüksek olmalı.' };
            }
            row[tbA] = s.tbA;
            row[tbB] = s.tbB;
        }
        out.push(row);
    }

    const hasMatchTb = out.some(s => s.matchTiebreak);
    if (decidingTiebreak) {
        let n1 = 0, n2 = 0;
        for (const s of out) {
            if (s.matchTiebreak) continue;
            if (s[a] > s[b]) n1++; else if (s[b] > s[a]) n2++;
        }
        if (n1 === 1 && n2 === 1 && !hasMatchTb) {
            return { ok: false, message: 'Setler 1-1. Üçüncü satır 10 sayıya tiebreak olmalı.' };
        }
    } else if (hasMatchTb) {
        return { ok: false, message: 'Bu maç normal set kurallı. Üçüncü set de normal set olarak girilmeli.' };
    }

    let sideA = 0, sideB = 0;
    for (const s of out) {
        if (s[a] > s[b]) sideA++; else if (s[b] > s[a]) sideB++;
    }
    if (sideA === sideB) return { ok: false, message: 'Geçersiz sonuç: eşitlik kabul edilmiyor.' };
    return { ok: true, sets: out, winner: sideA > sideB ? 'a' : 'b' };
}
