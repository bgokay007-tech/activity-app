import crypto from 'crypto';

/** HH:mm → dakika (0..1440) */
export function timeToMin(t) {
    if (!t || typeof t !== 'string') return null;
    const [h, m] = t.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
}

export function minToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** YYYY-MM-DD (TR günü) — Date'ten */
export function toYmd(d) {
    const x = new Date(d);
    // TR UTC+3 günü
    const tr = new Date(x.getTime() + 3 * 60 * 60 * 1000);
    return tr.toISOString().slice(0, 10);
}

function addDays(date, days) {
    const d = new Date(date);
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    return d;
}

/**
 * Turnuva başlangıcından itibaren haftalık turlar.
 * Tur 1: ilk 3 gün müsaitlik, oyun T0+3 → T0+10
 * Sonraki turlar: oyun haftası başlamadan 3 gün müsaitlik
 */
export function buildWeeklyRounds(baseDate, weekCount) {
    const n = Math.max(1, Math.min(52, parseInt(weekCount) || 4));
    const rounds = [];
    const week1PlayStart = addDays(baseDate, 3);
    for (let i = 0; i < n; i++) {
        const playStart = addDays(week1PlayStart, i * 7);
        const playEnd = addDays(playStart, 7);
        const availabilityOpenAt = i === 0 ? new Date(baseDate) : addDays(playStart, -3);
        const availabilityCloseAt = new Date(playStart);
        rounds.push({
            roundIndex: i + 1,
            startDate: playStart,
            endDate: playEnd,
            availabilityOpenAt,
            availabilityCloseAt,
            status: i === 0 ? 'AVAIL_OPEN' : 'UPCOMING',
        });
    }
    return rounds;
}

/** Slot normalize: date zorunlu tercih; weekday varsa tur penceresindeki o güne çevirilebilir */
export function normalizeSlots(slots, roundStart, roundEnd) {
    if (!Array.isArray(slots)) return [];
    const out = [];
    for (const s of slots) {
        if (!s || typeof s !== 'object') continue;
        const timeFrom = String(s.timeFrom || '').slice(0, 5);
        const timeTo = String(s.timeTo || '').slice(0, 5);
        if (!timeFrom || !timeTo) continue;
        const fromM = timeToMin(timeFrom);
        const toM = timeToMin(timeTo);
        if (fromM == null || toM == null || toM <= fromM) continue;

        if (s.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
            out.push({ date: s.date, timeFrom, timeTo });
            continue;
        }
        // weekday 1=Pzt..7=Paz → tur penceresindeki ilk eşleşen gün
        const wd = parseInt(s.weekday, 10);
        if (wd >= 1 && wd <= 7 && roundStart && roundEnd) {
            let cur = new Date(roundStart);
            const end = new Date(roundEnd);
            while (cur < end) {
                const tr = new Date(cur.getTime() + 3 * 60 * 60 * 1000);
                // JS: 0=Paz..6=Cmt → ISO 1=Pzt..7=Paz
                const js = tr.getUTCDay();
                const iso = js === 0 ? 7 : js;
                if (iso === wd) {
                    out.push({ date: toYmd(cur), timeFrom, timeTo });
                    break;
                }
                cur = addDays(cur, 1);
            }
        }
    }
    // aynı gün çakışanları birleştirme yok — ayrı bırak
    return out;
}

/** İki slot listesinin kesişimi; en uzun ortak aralık tercih edilir */
export function findBestOverlap(slotsA, slotsB) {
    let best = null;
    let bestDur = 0;
    for (const a of slotsA || []) {
        for (const b of slotsB || []) {
            if (!a.date || !b.date || a.date !== b.date) continue;
            const a0 = timeToMin(a.timeFrom);
            const a1 = timeToMin(a.timeTo);
            const b0 = timeToMin(b.timeFrom);
            const b1 = timeToMin(b.timeTo);
            if (a0 == null || a1 == null || b0 == null || b1 == null) continue;
            const from = Math.max(a0, b0);
            const to = Math.min(a1, b1);
            const dur = to - from;
            if (dur >= 60 && dur > bestDur) {
                bestDur = dur;
                best = { date: a.date, timeFrom: minToTime(from), timeTo: minToTime(to) };
            }
        }
    }
    return best;
}

export function pairKey(id1, id2) {
    return [id1, id2].sort().join('|');
}

export function fingerprintProposed(proposed) {
    const keys = (proposed || [])
        .filter(p => p?.p1Id && p?.p2Id)
        .map(p => pairKey(p.p1Id, p.p2Id))
        .sort();
    return crypto.createHash('sha256').update(keys.join(';')).digest('hex').slice(0, 32);
}

/**
 * sides: [{ id, name, skillRating, memberUserIds: string[] }]
 * availByUserId: { [userId]: { maxMatches, slots:[{date,timeFrom,timeTo}] } }
 * previousPairKeys: Set of "id1|id2" already played in tournament
 * existingRoundPairKeys: already approved this round
 * remainingCap override via usedCounts: { [sideId]: number already matched this round }
 */
export function generateAvailabilityPairings({
    sides,
    availByUserId,
    previousPairKeys = new Set(),
    existingRoundPairKeys = new Set(),
    usedCounts = {},
}) {
    // Takım müsaitliği = üyelerin slot kesişimi; kapasite = üyelerin min(kalan)
    const sideMeta = sides.map(side => {
        const members = side.memberUserIds?.length ? side.memberUserIds : [side.id];
        const avails = members.map(uid => availByUserId[uid]).filter(Boolean);
        if (avails.length !== members.length) {
            return { ...side, members, slots: [], remaining: 0, ready: false };
        }
        let slots = normalizeSlots(avails[0].slots);
        for (let i = 1; i < avails.length; i++) {
            const nextSlots = normalizeSlots(avails[i].slots);
            const merged = [];
            for (const a of slots) {
                for (const b of nextSlots) {
                    const ov = findBestOverlap([a], [b]);
                    if (ov) merged.push(ov);
                }
            }
            slots = merged;
        }
        const maxCap = Math.min(...avails.map(a => Math.max(0, Math.min(5, parseInt(a.maxMatches) || 1))));
        const used = usedCounts[side.id] || 0;
        const remaining = Math.max(0, maxCap - used);
        return {
            ...side,
            members,
            slots,
            remaining,
            ready: remaining > 0 && slots.length > 0,
            skillRating: side.skillRating || 0,
        };
    }).filter(s => s.ready);

    // Aday çiftler: ortak saat + skor
    const candidates = [];
    for (let i = 0; i < sideMeta.length; i++) {
        for (let j = i + 1; j < sideMeta.length; j++) {
            const a = sideMeta[i];
            const b = sideMeta[j];
            const pk = pairKey(a.id, b.id);
            if (existingRoundPairKeys.has(pk)) continue;
            const slot = findBestOverlap(a.slots, b.slots);
            if (!slot) continue;
            const neverPlayed = !previousPairKeys.has(pk);
            const eloDiff = Math.abs((a.skillRating || 0) - (b.skillRating || 0));
            // Önce oynamamışlar (0), sonra ELO yakınlığı
            const score = (neverPlayed ? 0 : 10000) + eloDiff;
            candidates.push({
                p1Id: a.id,
                p1Name: a.name,
                p2Id: b.id,
                p2Name: b.name,
                slot,
                neverPlayed,
                eloDiff,
                score,
            });
        }
    }
    candidates.sort((x, y) => x.score - y.score || x.p1Id.localeCompare(y.p1Id));

    const rem = Object.fromEntries(sideMeta.map(s => [s.id, s.remaining]));
    const proposed = [];
    const usedPairs = new Set(existingRoundPairKeys);

    for (const c of candidates) {
        if ((rem[c.p1Id] || 0) < 1 || (rem[c.p2Id] || 0) < 1) continue;
        const pk = pairKey(c.p1Id, c.p2Id);
        if (usedPairs.has(pk)) continue;
        proposed.push({
            p1Id: c.p1Id,
            p1Name: c.p1Name,
            p2Id: c.p2Id,
            p2Name: c.p2Name,
            slot: c.slot,
            neverPlayed: c.neverPlayed,
            eloDiff: c.eloDiff,
        });
        rem[c.p1Id] -= 1;
        rem[c.p2Id] -= 1;
        usedPairs.add(pk);
    }

    return proposed;
}

/** Admin manuel listede tekrarlayan / geçmiş çiftleri tespit et */
export function findDuplicateWarnings(proposed, previousPairKeys, existingRoundPairKeys) {
    const warnings = [];
    const seen = new Set();
    for (const p of proposed || []) {
        if (!p?.p1Id || !p?.p2Id) continue;
        const pk = pairKey(p.p1Id, p.p2Id);
        if (seen.has(pk)) {
            warnings.push({ code: 'DUPLICATE_IN_LIST', pairKey: pk, p1Id: p.p1Id, p2Id: p.p2Id });
        }
        seen.add(pk);
        if (existingRoundPairKeys.has(pk)) {
            warnings.push({ code: 'ALREADY_MATCHED_THIS_ROUND', pairKey: pk, p1Id: p.p1Id, p2Id: p.p2Id });
        }
        if (previousPairKeys.has(pk)) {
            warnings.push({ code: 'ALREADY_PLAYED_IN_TOURNAMENT', pairKey: pk, p1Id: p.p1Id, p2Id: p.p2Id });
        }
    }
    return warnings;
}
