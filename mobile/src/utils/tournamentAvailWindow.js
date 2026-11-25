/** YYYY-MM-DD (yerel gün — cihaz saati) */
export function toLocalYmd(d = new Date()) {
    const x = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function addDaysYmd(ymd, days) {
    const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
    d.setDate(d.getDate() + days);
    return toLocalYmd(d);
}

export function isoWeekdayFromYmd(ymd) {
    const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
    const js = d.getDay();
    return js === 0 ? 7 : js;
}

/** Tenis: 24s müsaitlik + 7 gün oyun = 8; diğer sporlar 7. Backend ile aynı. */
export function groupRoundCycleDays(tournamentOrSub) {
    const sub = typeof tournamentOrSub === 'string'
        ? tournamentOrSub
        : tournamentOrSub?.subCategory;
    return String(sub || '').toLowerCase() === 'tennis' ? 8 : 7;
}

/**
 * Maç müsaitlik penceresi — backend getMatchAvailWindow ile aynı mantık.
 * from/to: seçilebilir (geçmiş kırpılmış); roundStart/roundEnd: turun gerçek aralığı.
 */
export function getMatchAvailWindow(tournament, match, { now = new Date() } = {}) {
    if (!match) return null;
    const today = toLocalYmd(now);
    let startYmd = null;
    let endYmd = match.deadline ? toLocalYmd(match.deadline) : null;
    const cycle = groupRoundCycleDays(tournament);

    if (match.phase === 'PLAYOFF' && match.readyAt) {
        startYmd = toLocalYmd(match.readyAt);
        if (!endYmd) endYmd = addDaysYmd(startYmd, 7);
    } else if (tournament?.eventDate) {
        const baseYmd = toLocalYmd(tournament.eventDate);
        const round = Math.max(1, parseInt(match.round, 10) || 1);
        startYmd = addDaysYmd(baseYmd, (round - 1) * cycle);
        if (!endYmd) endYmd = addDaysYmd(baseYmd, round * cycle);
    } else if (endYmd) {
        startYmd = addDaysYmd(endYmd, -cycle);
    }

    if (!startYmd || !endYmd) return null;
    const fromYmd = startYmd < today ? today : startYmd;
    return {
        roundStartYmd: startYmd,
        roundEndYmd: endYmd,
        fromYmd,
        toYmd: endYmd,
        empty: fromYmd > endYmd,
    };
}

export function getRoundAvailWindow(round, { now = new Date() } = {}) {
    if (!round?.startDate || !round?.endDate) return null;
    const today = toLocalYmd(now);
    const startYmd = toLocalYmd(round.startDate);
    const endYmd = toLocalYmd(round.endDate);
    if (!startYmd || !endYmd) return null;
    const fromYmd = startYmd < today ? today : startYmd;
    return {
        roundStartYmd: startYmd,
        roundEndYmd: endYmd,
        fromYmd,
        toYmd: endYmd,
        empty: fromYmd > endYmd,
    };
}

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

export function fmtYmdShort(ymd, locale = 'tr-TR') {
    if (!ymd) return '—';
    try {
        return new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, {
            day: '2-digit',
            month: '2-digit',
        });
    } catch {
        return String(ymd).slice(0, 10);
    }
}

/** API'den gelen date/weekday karışığını UI weekday chip'lerine çevir */
export function slotsToWeekdayUi(raw) {
    const byWd = new Map();
    for (const s of raw || []) {
        if (!s) continue;
        let wd = s.weekday != null ? Number(s.weekday) : null;
        if (!(wd >= 1 && wd <= 7) && s.date) wd = isoWeekdayFromYmd(s.date);
        if (!(wd >= 1 && wd <= 7)) continue;
        if (!byWd.has(wd)) {
            byWd.set(wd, {
                weekday: wd,
                timeFrom: s.timeFrom || '09:00',
                timeTo: s.timeTo || '21:00',
            });
        }
    }
    return [...byWd.values()];
}
