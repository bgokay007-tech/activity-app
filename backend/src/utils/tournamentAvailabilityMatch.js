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

/** YYYY-MM-DD + N gün (takvim günü, TR günü bozulmasın diye öğlen UTC) */
export function addDaysYmd(ymd, days) {
    const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** ISO weekday 1=Pzt..7=Paz for YYYY-MM-DD */
export function isoWeekdayFromYmd(ymd) {
    const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00.000Z`);
    const js = d.getUTCDay();
    return js === 0 ? 7 : js;
}

/** Grup turu oyun süresi (gün). */
export const ROUND_PLAY_DAYS = 7;
/** Tenis: her tur/grup öncesi müsaitlik bekleme (24 saat). */
export const TENNIS_AVAIL_LEAD_DAYS = 1;
/** Diğer sporlar (availability engine): tur öncesi müsaitlik (eski davranış). */
export const DEFAULT_AVAIL_LEAD_DAYS = 3;

export function isTennisTournament(tournamentOrSub) {
    const sub = typeof tournamentOrSub === 'string'
        ? tournamentOrSub
        : tournamentOrSub?.subCategory;
    return String(sub || '').toLowerCase() === 'tennis';
}

/** Tenis tur döngüsü: 24s müsaitlik + 7 gün oyun = 8 gün. */
export function groupRoundCycleDays(tournamentOrSub) {
    if (isTennisTournament(tournamentOrSub)) {
        return TENNIS_AVAIL_LEAD_DAYS + ROUND_PLAY_DAYS;
    }
    return ROUND_PLAY_DAYS;
}

/** Grup maçı deadline = base + bu kadar gün (tur 1 → tenis 8, diğer 7). */
export function groupRoundDeadlineOffsetDays(round, tournamentOrSub) {
    const r = Math.max(1, parseInt(round, 10) || 1);
    return r * groupRoundCycleDays(tournamentOrSub);
}

/** Müsaitlik penceresi başlangıcı: base'den kaç gün sonra (tur arasi 24s dahil). */
export function groupRoundWindowStartOffsetDays(round, tournamentOrSub) {
    const r = Math.max(1, parseInt(round, 10) || 1);
    return (r - 1) * groupRoundCycleDays(tournamentOrSub);
}

export function groupMatchDeadlineFromBase(baseDate, round, tournamentOrSub) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + groupRoundDeadlineOffsetDays(round, tournamentOrSub));
    return d;
}

/**
 * Maç / tur oynama penceresi (YYYY-MM-DD).
 * Grup: [eventDate+(round-1)*cycle , deadline]
 *   Tenis cycle=8 (24s müsaitlik + 7 gün oyun); diğer cycle=7
 * Play-off: [readyAt , deadline] (deadline yoksa readyAt+7)
 * Joker uzatması deadline'ı uzatır; başlangıç aynı kalır.
 */
export function getMatchAvailWindow(tournament, match, { now = new Date() } = {}) {
    if (!match) return null;
    const today = toYmd(now);
    let startYmd = null;
    let endYmd = match.deadline ? toYmd(match.deadline) : null;

    if (match.phase === 'PLAYOFF' && match.readyAt) {
        startYmd = toYmd(match.readyAt);
        if (!endYmd) endYmd = addDaysYmd(startYmd, 7);
    } else if (tournament?.eventDate) {
        const baseYmd = toYmd(tournament.eventDate);
        const round = Math.max(1, parseInt(match.round, 10) || 1);
        startYmd = addDaysYmd(baseYmd, groupRoundWindowStartOffsetDays(round, tournament));
        if (!endYmd) endYmd = addDaysYmd(baseYmd, groupRoundDeadlineOffsetDays(round, tournament));
    } else if (endYmd) {
        startYmd = addDaysYmd(endYmd, -groupRoundCycleDays(tournament));
    }

    if (!startYmd || !endYmd) return null;
    // Geçmiş günler seçilemez — pencere bugünden itibaren
    const fromYmd = startYmd < today ? today : startYmd;
    return {
        roundStartYmd: startYmd,
        roundEndYmd: endYmd,
        fromYmd,
        toYmd: endYmd,
        empty: fromYmd > endYmd,
    };
}

/** Tur kaydı (availability engine) için aynı clamp */
export function getRoundAvailWindow(round, { now = new Date() } = {}) {
    if (!round?.startDate || !round?.endDate) return null;
    const today = toYmd(now);
    const startYmd = toYmd(round.startDate);
    const endYmd = toYmd(round.endDate);
    const fromYmd = startYmd < today ? today : startYmd;
    return {
        roundStartYmd: startYmd,
        roundEndYmd: endYmd,
        fromYmd,
        toYmd: endYmd,
        empty: fromYmd > endYmd,
    };
}

/** [fromYmd, toYmd] içinde geçen ISO weekday'ler */
export function weekdaysInYmdRange(fromYmd, toYmd) {
    if (!fromYmd || !toYmd || fromYmd > toYmd) return [];
    const set = new Set();
    let cur = fromYmd;
    let guard = 0;
    while (cur <= toYmd && guard < 60) {
        set.add(isoWeekdayFromYmd(cur));
        cur = addDaysYmd(cur, 1);
        guard += 1;
    }
    return [...set].sort((a, b) => a - b);
}

/**
 * Slot'ları pencereye sıkıştır: weekday → penceredeki tüm eşleşen tarihler;
 * date varsa aralık + bugün kontrolü. Geçmiş / dışı atılır.
 */
export function constrainSlotsToWindow(slots, fromYmd, toYmd) {
    if (!fromYmd || !toYmd || fromYmd > toYmd) return [];
    if (!Array.isArray(slots)) return [];
    const out = [];
    const seen = new Set();
    for (const s of slots) {
        if (!s || typeof s !== 'object') continue;
        const timeFrom = String(s.timeFrom || '').slice(0, 5);
        const timeTo = String(s.timeTo || '').slice(0, 5);
        if (!timeFrom || !timeTo) continue;
        const fromM = timeToMin(timeFrom);
        const toM = timeToMin(timeTo);
        if (fromM == null || toM == null || toM <= fromM) continue;

        const push = (date) => {
            if (!date || date < fromYmd || date > toYmd) return;
            const key = `${date}|${timeFrom}|${timeTo}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ date, timeFrom, timeTo });
        };

        if (s.date && /^\d{4}-\d{2}-\d{2}$/.test(String(s.date))) {
            push(String(s.date).slice(0, 10));
            continue;
        }
        const wd = parseInt(s.weekday, 10);
        if (!(wd >= 1 && wd <= 7)) continue;
        let cur = fromYmd;
        let guard = 0;
        while (cur <= toYmd && guard < 60) {
            if (isoWeekdayFromYmd(cur) === wd) push(cur);
            cur = addDaysYmd(cur, 1);
            guard += 1;
        }
    }
    return out;
}

export function isYmdInWindow(ymd, fromYmd, toYmd) {
    if (!ymd || !fromYmd || !toYmd) return false;
    const d = String(ymd).slice(0, 10);
    return d >= fromYmd && d <= toYmd;
}

/**
 * Turnuva başlangıcından itibaren turlar.
 * Varsayılan: ilk 3 gün müsaitlik, sonra 7 gün oyun; sonraki turlar oyun öncesi 3 gün
 *   (oyun haftaları bitişik — eski davranış).
 * Tenis (sequentialCycles + availLeadDays=1): her tur/grup arası 24s müsaitlik,
 *   sonra 7 gün oyun; turlar ardışık (T0→24s→7g→24s→7g…).
 */
export function buildWeeklyRounds(baseDate, weekCount, opts = {}) {
    const n = Math.max(1, Math.min(52, parseInt(weekCount) || 4));
    const lead = opts.availLeadDays != null
        ? Math.max(0, Number(opts.availLeadDays))
        : DEFAULT_AVAIL_LEAD_DAYS;
    const play = opts.playDays != null
        ? Math.max(1, Number(opts.playDays))
        : ROUND_PLAY_DAYS;
    const sequential = !!opts.sequentialCycles;
    const rounds = [];

    if (sequential) {
        const cycle = lead + play;
        for (let i = 0; i < n; i++) {
            const cycleStart = addDays(baseDate, i * cycle);
            const playStart = addDays(cycleStart, lead);
            const playEnd = addDays(playStart, play);
            rounds.push({
                roundIndex: i + 1,
                startDate: playStart,
                endDate: playEnd,
                availabilityOpenAt: new Date(cycleStart),
                availabilityCloseAt: new Date(playStart),
                status: i === 0 ? 'AVAIL_OPEN' : 'UPCOMING',
            });
        }
        return rounds;
    }

    const week1PlayStart = addDays(baseDate, lead);
    for (let i = 0; i < n; i++) {
        const playStart = addDays(week1PlayStart, i * play);
        const playEnd = addDays(playStart, play);
        const availabilityOpenAt = i === 0 ? new Date(baseDate) : addDays(playStart, -lead);
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

/** Slot normalize: date zorunlu tercih; weekday varsa tur penceresindeki o güne çevirilebilir.
 *  Geçmiş günler ve tur dışı tarihler elenir (bugün = TR toYmd). */
export function normalizeSlots(slots, roundStart, roundEnd, { now = new Date() } = {}) {
    if (!Array.isArray(slots)) return [];
    if (!roundStart || !roundEnd) return [];
    const win = getRoundAvailWindow({ startDate: roundStart, endDate: roundEnd }, { now });
    if (!win || win.empty) return [];
    // weekday → penceredeki TÜM eşleşen günler (eskiden sadece ilk gün yazılıyordu;
    // tur 7+ gün / joker uzatmasında ikinci hafta kayboluyordu)
    return constrainSlotsToWindow(slots, win.fromYmd, win.toYmd);
}

/**
 * weekday / date karışık müsaitlik → somut tarihler.
 * untilYmd verilirse tur/deadline dışına taşmaz; yoksa fromDate'ten daysAhead.
 */
export function expandAvailabilitySlots(slots, {
    fromDate = new Date(),
    daysAhead = 21,
    fromYmd = null,
    untilYmd = null,
} = {}) {
    if (!Array.isArray(slots)) return [];
    const startYmd = fromYmd || toYmd(fromDate);
    let endYmd = untilYmd;
    if (!endYmd) {
        endYmd = addDaysYmd(startYmd, Math.max(0, daysAhead - 1));
    }
    if (startYmd > endYmd) return [];
    return constrainSlotsToWindow(slots, startYmd, endYmd);
}

/**
 * Maç scheduleData → ortak saat pencereleri + ortak kortlar.
 * noCourtOverlap: ortak saat var ama ortak kort yok (oyuncular kort eklesin / teklifte seçsin).
 * availFromYmd/availUntilYmd: tur penceresi (geçmiş gün + tur dışı elenir).
 */
export function computeMatchScheduleSuggested(schedule, {
    playersArrange = true,
    availFromYmd = null,
    availUntilYmd = null,
} = {}) {
    const expandOpts = (availFromYmd && availUntilYmd)
        ? { fromYmd: availFromYmd, untilYmd: availUntilYmd }
        : {};
    const p1 = expandAvailabilitySlots(schedule?.availability?.p1, expandOpts);
    const p2 = expandAvailabilitySlots(schedule?.availability?.p2, expandOpts);
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
