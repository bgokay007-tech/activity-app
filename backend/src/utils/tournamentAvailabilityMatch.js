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

/**
 * weekday / date karışık müsaitlik → somut tarihler (önümüzdeki N gün).
 * findAllOverlaps tarih ister; maç kartı formları çoğunlukla weekday yazar.
 */
export function expandAvailabilitySlots(slots, { fromDate = new Date(), daysAhead = 21 } = {}) {
    if (!Array.isArray(slots)) return [];
    const out = [];
    const start = new Date(fromDate);
    for (const s of slots) {
        if (!s || typeof s !== 'object') continue;
        const timeFrom = String(s.timeFrom || '').slice(0, 5);
        const timeTo = String(s.timeTo || '').slice(0, 5);
        const fromM = timeToMin(timeFrom);
        const toM = timeToMin(timeTo);
        if (fromM == null || toM == null || toM <= fromM) continue;

        if (s.date && /^\d{4}-\d{2}-\d{2}$/.test(String(s.date))) {
            out.push({ date: String(s.date).slice(0, 10), timeFrom, timeTo });
            continue;
        }
        const wd = parseInt(s.weekday, 10);
        if (!(wd >= 1 && wd <= 7)) continue;
        for (let i = 0; i < daysAhead; i++) {
            const cur = addDays(start, i);
            const tr = new Date(cur.getTime() + 3 * 60 * 60 * 1000);
            const js = tr.getUTCDay();
            const iso = js === 0 ? 7 : js;
            if (iso === wd) out.push({ date: toYmd(cur), timeFrom, timeTo });
        }
    }
    return out;
}

/**
 * Maç scheduleData → ortak saat pencereleri + ortak kortlar.
 * noCourtOverlap: ortak saat var ama ortak kort yok (oyuncular kort eklesin / teklifte seçsin).
 */
export function computeMatchScheduleSuggested(schedule, { playersArrange = true } = {}) {
    const p1 = expandAvailabilitySlots(schedule?.availability?.p1);
    const p2 = expandAvailabilitySlots(schedule?.availability?.p2);
    if (!p1.length || !p2.length) return null;

    const windows = findAllOverlaps(p1, p2).slice(0, 14).map(w => ({
        date: w.date,
        timeFrom: w.timeFrom,
        timeTo: w.timeTo,
        durationMin: w.durationMin,
    }));
    if (!windows.length) {
        return { windows: [], courts: [], noTimeOverlap: true, noCourtOverlap: false };
    }

    let courts = [];
    if (playersArrange) {
        courts = intersectCourts(
            schedule?.preferredCourts?.p1,
            schedule?.preferredCourts?.p2,
        ).map(c => ({
            courtId: c.courtId || null,
            venueId: c.venueId || null,
            name: c.name,
            city: c.city || null,
            key: c.key || null,
            isProVenue: c.isProVenue === true,
        }));
    }

    return {
        windows,
        courts,
        noTimeOverlap: false,
        noCourtOverlap: playersArrange && courts.length === 0,
    };
}

/** İki slot listesinin kesişimi; en uzun ortak aralık tercih edilir */
export function findBestOverlap(slotsA, slotsB) {
    const all = findAllOverlaps(slotsA, slotsB);
    return all[0] || null;
}

/** Tüm ortak aralıklar (≥60 dk), uzunluğa göre azalan */
export function findAllOverlaps(slotsA, slotsB) {
    const out = [];
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
            if (dur >= 60) {
                out.push({
                    date: a.date,
                    timeFrom: minToTime(from),
                    timeTo: minToTime(to),
                    durationMin: dur,
                });
            }
        }
    }
    out.sort((x, y) => y.durationMin - x.durationMin || String(x.date).localeCompare(String(y.date)));
    return out;
}

/** Kort adı karşılaştırma — TR İ/ı, fazla boşluk */
export function normalizeCourtName(name) {
    return String(name || '')
        .trim()
        .toLocaleLowerCase('tr-TR')
        .replace(/\s+/g, ' ');
}

/** Kort/mekan kimliği — courtId > venueId > normalize ad */
export function courtKey(c) {
    if (!c || typeof c !== 'object') return null;
    if (c.courtId) return `c:${c.courtId}`;
    if (c.venueId) return `v:${c.venueId}`;
    const name = normalizeCourtName(c.name);
    return name ? `n:${name}` : null;
}

function pickRicherCourt(a, b) {
    // venueId / courtId / isProVenue olanı tercih et
    const score = (c) => (c?.courtId ? 4 : 0) + (c?.venueId ? 2 : 0) + (c?.isProVenue ? 1 : 0);
    return score(b) > score(a) ? b : a;
}

export function courtsMatch(a, b) {
    if (!a || !b) return false;
    if (a.courtId && b.courtId && String(a.courtId) === String(b.courtId)) return true;
    if (a.venueId && b.venueId && String(a.venueId) === String(b.venueId)) return true;
    const na = normalizeCourtName(a.name);
    const nb = normalizeCourtName(b.name);
    return !!(na && nb && na === nb);
}

export function normalizePreferredCourts(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of list) {
        if (!raw || typeof raw !== 'object') continue;
        const name = String(raw.name || '').trim().slice(0, 120);
        if (!name && !raw.courtId && !raw.venueId) continue;
        const item = {
            courtId: raw.courtId ? String(raw.courtId) : null,
            venueId: raw.venueId ? String(raw.venueId) : null,
            venueCourtId: raw.venueCourtId ? String(raw.venueCourtId) : null,
            name: name || (raw.venueId ? 'Venue' : 'Court'),
            city: raw.city ? String(raw.city).trim().slice(0, 80) : null,
            isProVenue: raw.isProVenue === true,
        };
        const key = courtKey(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ ...item, key });
        if (out.length >= 20) break;
    }
    return out;
}

/**
 * İki kort listesinin ortakları.
 * Aynı kimlik VEYA aynı normalize ad (arama=venueId, manuel=ad) eşleşir.
 */
export function intersectCourts(listA, listB) {
    const a = normalizePreferredCourts(listA);
    const b = normalizePreferredCourts(listB);
    if (!a.length || !b.length) return [];
    const out = [];
    const seen = new Set();
    for (const ca of a) {
        for (const cb of b) {
            if (!courtsMatch(ca, cb)) continue;
            const picked = pickRicherCourt(ca, cb);
            const k = courtKey(picked) || normalizeCourtName(picked.name);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            out.push({ ...picked, key: k });
        }
    }
    return out;
}

/** Turnuva location'ı belirli kort mu, oyuncular mı seçer */
export function isPlayersArrangeCourts(tournament) {
    const loc = String(tournament?.location || '').trim();
    if (!loc) return true;
    return /ortaklaşa|oyuncular|players decide|gemeinsam|соглас/i.test(loc);
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
 * availByUserId: { [userId]: { maxMatches, slots, preferredCourts? } }
 * requireCourtOverlap: belirli kort yok — ortak kort şart
 * previousPairKeys / existingRoundPairKeys / usedCounts: kapasite & tekrar kontrolü
 */
export function generateAvailabilityPairings({
    sides,
    availByUserId,
    previousPairKeys = new Set(),
    existingRoundPairKeys = new Set(),
    usedCounts = {},
    requireCourtOverlap = false,
}) {
    // Takım müsaitliği = üyelerin slot kesişimi; kapasite = üyelerin min(kalan)
    // Kort tercihi = üyelerin ortak kortları (belirli kort yok modunda)
    const sideMeta = sides.map(side => {
        const members = side.memberUserIds?.length ? side.memberUserIds : [side.id];
        const avails = members.map(uid => availByUserId[uid]).filter(Boolean);
        if (avails.length !== members.length) {
            return { ...side, members, slots: [], courts: [], remaining: 0, ready: false };
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
        let courts = normalizePreferredCourts(avails[0].preferredCourts);
        for (let i = 1; i < avails.length; i++) {
            courts = intersectCourts(courts, avails[i].preferredCourts);
        }
        const maxCap = Math.min(...avails.map(a => Math.max(0, Math.min(5, parseInt(a.maxMatches) || 1))));
        const used = usedCounts[side.id] || 0;
        const remaining = Math.max(0, maxCap - used);
        const ready = remaining > 0
            && slots.length > 0
            && (!requireCourtOverlap || courts.length > 0);
        return {
            ...side,
            members,
            slots,
            courts,
            remaining,
            ready,
            skillRating: side.skillRating || 0,
        };
    }).filter(s => s.ready);

    // Aday çiftler: ortak saat (+ ortak kort) + skor
    const candidates = [];
    for (let i = 0; i < sideMeta.length; i++) {
        for (let j = i + 1; j < sideMeta.length; j++) {
            const a = sideMeta[i];
            const b = sideMeta[j];
            const pk = pairKey(a.id, b.id);
            if (existingRoundPairKeys.has(pk)) continue;
            const windows = findAllOverlaps(a.slots, b.slots);
            if (!windows.length) continue;
            const slot = windows[0];
            const commonCourts = requireCourtOverlap
                ? intersectCourts(a.courts, b.courts)
                : intersectCourts(a.courts, b.courts);
            if (requireCourtOverlap && !commonCourts.length) continue;
            const neverPlayed = !previousPairKeys.has(pk);
            const eloDiff = Math.abs((a.skillRating || 0) - (b.skillRating || 0));
            // Önce oynamamışlar, sonra ELO; ortak kort/uzun pencere bonus
            const score = (neverPlayed ? 0 : 10000)
                + eloDiff
                - Math.min(40, commonCourts.length * 8)
                - Math.min(80, (slot.durationMin || 0) / 15);
            candidates.push({
                p1Id: a.id,
                p1Name: a.name,
                p2Id: b.id,
                p2Name: b.name,
                slot,
                windows,
                commonCourts,
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
            windows: c.windows,
            commonCourts: c.commonCourts,
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
