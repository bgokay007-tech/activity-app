// Tenis / padel / pickleball skor girişi.
// 7-6 setinde parantez (set tiebreak, 7 sayı / 2 fark).
// decidingTiebreak:
//   - 3 set: 1-1 → 3. satır 10 sayı süper tiebreak
//   - 5 set: 2-2 → 5. satır 10 sayı süper tiebreak
// Normal kuralda son set de normal settir.

export const RACKET_SET_SPORTS = ['tennis', 'padel', 'pickleball'];

export const isRacketSetSport = (sub) => RACKET_SET_SPORTS.includes(sub);

export function decidingTiebreakAllowed(setsPerMatch) {
    const n = parseInt(setsPerMatch, 10);
    return n === 3 || n === 5;
}

export function isSevenSix(a, b) {
    return Math.max(a, b) === 7 && Math.min(a, b) === 6;
}

export function setGamesValid(a, b) {
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
}

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

export function normalizeRacketSets(raw, {
    decidingTiebreak = false,
    setsPerMatch = 3,
    a = 'p1',
    b = 'p2',
    tbA = 'tb1',
    tbB = 'tb2',
} = {}) {
    if (!Array.isArray(raw) || raw.length === 0) return { ok: false, code: 'missingScore' };
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
    if (!parsed.length) return { ok: false, code: 'missingScore' };

    const n = parseInt(setsPerMatch, 10);
    const effectiveN = decidingTiebreak && (n === 2 || !Number.isFinite(n))
        ? 3
        : (Number.isFinite(n) && n > 0 ? n : 3);
    const decidingIdx = effectiveN - 1;
    const splitAt = Math.floor(effectiveN / 2);

    const out = [];
    for (let i = 0; i < parsed.length; i++) {
        const s = parsed[i];
        let w1 = 0, w2 = 0;
        for (let j = 0; j < i; j++) {
            if (parsed[j].a > parsed[j].b) w1++;
            else if (parsed[j].b > parsed[j].a) w2++;
        }
        const splitDecider = !!decidingTiebreak
            && i === decidingIdx
            && w1 === splitAt
            && w2 === splitAt;
        if (s.matchTiebreak || splitDecider) {
            if (!splitDecider) {
                return { ok: false, code: effectiveN >= 5 ? 'racketMatchTbPlace5' : 'racketMatchTbPlace' };
            }
            if (!pointsValid(s.a, s.b, 10)) return { ok: false, code: 'racketMatchTbInvalid', score: `${s.a}-${s.b}` };
            out.push({ [a]: s.a, [b]: s.b, matchTiebreak: true });
            continue;
        }
        if (!setGamesValid(s.a, s.b)) return { ok: false, code: 'racketSetInvalid', score: `${s.a}-${s.b}` };
        const row = { [a]: s.a, [b]: s.b };
        if (isSevenSix(s.a, s.b)) {
            if (s.tbA == null || s.tbB == null) return { ok: false, code: 'racketTbRequired' };
            if (!pointsValid(s.tbA, s.tbB, 7)) return { ok: false, code: 'racketTbInvalid', score: `${s.tbA}-${s.tbB}` };
            if ((s.a > s.b) !== (s.tbA > s.tbB)) return { ok: false, code: 'racketTbSide' };
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
        if (n1 === splitAt && n2 === splitAt && !hasMatchTb) {
            return { ok: false, code: effectiveN >= 5 ? 'racketMatchTbMissing5' : 'racketMatchTbMissing' };
        }
    } else if (hasMatchTb) {
        return { ok: false, code: 'racketNormalThird' };
    }

    let sideA = 0, sideB = 0;
    for (const s of out) {
        if (s[a] > s[b]) sideA++; else if (s[b] > s[a]) sideB++;
    }
    if (sideA === sideB) return { ok: false, code: 'racketDraw' };
    return { ok: true, sets: out, winner: sideA > sideB ? 'a' : 'b' };
}

/**
 * Best-of N skor UI: eşitlik karar setine gelince son satırı açar.
 * deciding true → o satır süper tiebreak (10 sayı); değilse normal set.
 */
export function syncDecidingSet(rows, {
    deciding = false,
    setsPerMatch = 3,
    aKey = 'p1',
    bKey = 'p2',
} = {}) {
    const nRaw = parseInt(setsPerMatch, 10);
    const n = deciding && (nRaw === 2 || !Number.isFinite(nRaw))
        ? 3
        : (Number.isFinite(nRaw) && nRaw > 0 ? nRaw : 3);
    const headLen = Math.max(1, n - 1);
    const splitAt = Math.floor(n / 2);
    const head = rows.slice(0, headLen).map(r => ({ ...r, matchTiebreak: false }));
    while (head.length < headLen) head.push({ [aKey]: '', [bKey]: '', matchTiebreak: false });

    let w1 = 0, w2 = 0;
    for (const r of head) {
        const ga = parseInt(r[aKey], 10) || 0;
        const gb = parseInt(r[bKey], 10) || 0;
        if (ga === 0 && gb === 0) continue;
        if (ga > gb) w1++; else if (gb > ga) w2++;
    }
    if (w1 === splitAt && w2 === splitAt) {
        const prev = rows[headLen];
        const keep = prev && !!prev.matchTiebreak === !!deciding;
        return [...head, {
            ...(keep ? prev : {}),
            [aKey]: keep ? (prev[aKey] || '') : '',
            [bKey]: keep ? (prev[bKey] || '') : '',
            matchTiebreak: !!deciding,
        }];
    }
    return head;
}

/** @deprecated syncDecidingSet kullan — 3 set / 1-1 uyumluluk sarmalayıcısı */
export function syncSplitThirdSet(rows, opts = {}) {
    return syncDecidingSet(rows, { ...opts, setsPerMatch: 3 });
}

export function formatSetScore(set, aKey, bKey, tbAKey, tbBKey) {
    if (!set) return '';
    const a = set[aKey] ?? 0;
    const b = set[bKey] ?? 0;
    if (set.matchTiebreak) return `TB ${a}-${b}`;
    const tbA = set[tbAKey];
    const tbB = set[tbBKey];
    if (tbA != null && tbB != null && isSevenSix(Number(a) || 0, Number(b) || 0)) {
        return `${a}-${b} (${tbA}-${tbB})`;
    }
    return `${a}-${b}`;
}

export function racketAlertText(t, check) {
    if (!check || check.ok) return '';
    const msg = t[check.code];
    if (typeof msg === 'function') return msg(check.score || '');
    if (typeof msg === 'string') return msg;
    return t.actionFailed || '';
}

/** Oluşturma / düzenleme picker değeri: '1'|'2'|'3'|'3tb'|'4'|'5'|'5tb' */
export function encodeSetsFormat(setsPerMatch, decidingTiebreak) {
    const n = String(setsPerMatch || '');
    if (decidingTiebreak && n === '3') return '3tb';
    if (decidingTiebreak && n === '5') return '5tb';
    return n;
}

export function decodeSetsFormat(value) {
    if (value === '3tb') return { setsPerMatch: '3', decidingTiebreak: true };
    if (value === '5tb') return { setsPerMatch: '5', decidingTiebreak: true };
    return { setsPerMatch: String(value || ''), decidingTiebreak: false };
}
