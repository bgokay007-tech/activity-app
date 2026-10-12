// DEFİ LİGİ (challenge ladder / meydan okuma merdiveni) — saf algoritmalar, DB'ye dokunmaz.
//
// Kurallar Türkiye'deki kulüp defi yönergelerinden derlendi (Aydın Tenis Kulübü Defi Yönetmeliği
// 2026, Ataşehir TSK, Tekirdağ TK, sibertenis "Lig Mücadelesi"). Ortak çekirdek:
//   1. Tek sütunlu sıralama. İlk sıralama ELO'ya göre ya da kura ile; sonradan katılan SON sıradan girer.
//   2. Alttaki, kendisinden en fazla N basamak yukarıdakine teklif (defi) eder. N sıraya göre
//      kademeli büyür (Aydın 2026: ilk 10 → 4, 11–20 → 5, … her 10 sırada +1, en fazla 14).
//   3. Teklif eden KAZANIRSA rakibin sırasını alır; rakip ve aradakiler birer basamak aşağı kayar.
//      Teklif eden KAYBEDERSE sıralama değişmez.
//   4. Teklif alan belirli sürede (varsayılan 48 saat) cevap vermezse hükmen (W.O.) yenilmiş sayılır.
//   5. Sezonda belirli sayıda (varsayılan 1) mazeretsiz ret hakkı vardır; hak bitince ret = W.O.
//   6. Kabul edilen maç teklif tarihinden itibaren belirli sürede (varsayılan 10 gün) oynanmalı;
//      oynanmazsa teklif düşer, sıralama değişmez (teklif eden "kaybetmiş" sayılır — Tekirdağ kuralı
//      ile aynı sonuç, çünkü teklif edenin kaybı sıralamayı zaten değiştirmez).
//   7. Maçtan çıkan iki taraf belirli süre (varsayılan 2 gün) "korunmada"dır: teklif edemez/alamaz.
//      Aynı iki taraf birbirine belirli süre (varsayılan 7 gün) tekrar teklif edemez.
//   8. Belirli süre (varsayılan 14 gün) hiç defi maçı yapmayan bir basamak geriler; süre her
//      dolduğunda tekrar.
//   9. Herkesin aynı anda tek aktif defisi olabilir (teklif edilen ya da alınan).

export const DEFI_ENGINE_TYPE = '9';
export const DEFI_SUBS = ['tennis', 'padel', 'volleyball', 'basketball', 'football'];
export const DEFI_TEAM_SUBS = ['volleyball', 'basketball', 'football'];
export const DEFI_ACTIVE_STATUSES = ['DEFI_OFFERED', 'DEFI_ACCEPTED', 'DEFI_SCORED'];
export const DEFI_DONE_STATUSES = ['COMPLETED', 'FORFEIT'];

export const DEFI_DEFAULTS = {
    entry: 'SINGLES',          // SINGLES | PAIR | TEAM
    maxUp: null,               // null = kademeli (Aydın 2026), sayı = herkes için sabit basamak
    responseHours: 48,
    playDays: 10,
    declinesPerSeason: 1,
    protectionDays: 2,
    rematchDays: 7,
    inactivityDays: 14,
    initialOrder: 'ELO',       // ELO | RANDOM
};

export function defaultEntryFor(sub) {
    if (DEFI_TEAM_SUBS.includes(sub)) return 'TEAM';
    if (sub === 'padel') return 'PAIR';
    return 'SINGLES';
}

const int = (v, min, max, def) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

// Takım sporlarında giriş her zaman TAKIM — bireysel voleybol/futbol merdiveni anlamsız.
export function sanitizeDefiSettings(raw, sub) {
    const r = raw && typeof raw === 'object' ? raw : {};
    let entry = ['SINGLES', 'PAIR', 'TEAM'].includes(r.entry) ? r.entry : defaultEntryFor(sub);
    if (DEFI_TEAM_SUBS.includes(sub)) entry = 'TEAM';
    else if (entry === 'TEAM') entry = defaultEntryFor(sub);
    return {
        entry,
        maxUp: r.maxUp == null || r.maxUp === '' ? null : int(r.maxUp, 1, 20, null),
        responseHours: int(r.responseHours, 12, 168, DEFI_DEFAULTS.responseHours),
        playDays: int(r.playDays, 3, 30, DEFI_DEFAULTS.playDays),
        declinesPerSeason: int(r.declinesPerSeason, 0, 10, DEFI_DEFAULTS.declinesPerSeason),
        protectionDays: int(r.protectionDays, 0, 14, DEFI_DEFAULTS.protectionDays),
        rematchDays: int(r.rematchDays, 0, 60, DEFI_DEFAULTS.rematchDays),
        inactivityDays: int(r.inactivityDays, 0, 90, DEFI_DEFAULTS.inactivityDays), // 0 = kapalı
        initialOrder: r.initialOrder === 'RANDOM' ? 'RANDOM' : 'ELO',
    };
}

// rank 1 tabanlı. Kademeli: 1–10 → 4, 11–20 → 5, 21–30 → 6 … en fazla 14.
export function maxUpFor(rank, settings) {
    if (settings?.maxUp) return settings.maxUp;
    return Math.min(14, 4 + Math.floor((Math.max(1, rank) - 1) / 10));
}

// Kabul edilmiş katılımcılardan merdiven birimleri. Çift girişte sadece KARŞILIKLI partner seçmiş
// ve ikisi de kabul edilmiş oyuncular birim olur; eşi olmayan bekler (merdivende görünmez).
export function buildUnits(participants, entry) {
    const accepted = (participants || []).filter(p => p.status === 'ACCEPTED' && p.userId);
    const nameOf = (p) => p.user?.fullName || p.user?.username || p.manualName || '?';
    if (entry === 'PAIR') {
        const byUser = new Map(accepted.map(p => [p.userId, p]));
        const seen = new Set();
        const units = [];
        for (const p of accepted) {
            if (seen.has(p.userId) || !p.partnerId) continue;
            const q = byUser.get(p.partnerId);
            if (!q || q.partnerId !== p.userId || seen.has(q.userId)) continue;
            seen.add(p.userId); seen.add(q.userId);
            const [a, b] = [p, q].sort((x, y) => (x.userId < y.userId ? -1 : 1));
            units.push({
                key: `pair:${a.userId}:${b.userId}`,
                name: `${nameOf(a)} & ${nameOf(b)}`,
                members: [a.userId, b.userId],
                rating: ((a._rating ?? 0) + (b._rating ?? 0)) / 2,
                acceptedAt: [a.acceptedAt, b.acceptedAt].filter(Boolean).sort().pop() || null,
            });
        }
        return units;
    }
    return accepted.map(p => ({
        key: `u:${p.userId}`,
        name: entry === 'TEAM' ? (p.teamName || nameOf(p)) : nameOf(p),
        captainName: entry === 'TEAM' ? nameOf(p) : null,
        members: [p.userId],
        rating: p._rating ?? 0,
        acceptedAt: p.acceptedAt || null,
    }));
}

function shuffle(arr, rng = Math.random) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function initialOrder(units, mode, rng) {
    if (mode === 'RANDOM') return shuffle(units, rng).map(u => u.key);
    return [...units].sort((a, b) => (b.rating || 0) - (a.rating || 0)).map(u => u.key);
}

// Merdiveni güncel birimlerle hizalar: ayrılan birim çıkar (altındakiler birer yukarı), yeni
// birim kabul sırasına göre sona eklenir. Her defi işleminden önce çağrılır — böylece katılım
// kabul/iptal akışlarına (tournament.controller.js) ayrıca kanca eklemek gerekmez.
export function syncLadder(state, units, now = new Date()) {
    const s = { ...emptyState(), ...(state || {}) };
    const unitMap = Object.fromEntries(units.map(u => [u.key, u]));
    const before = s.order.join('|');
    const removed = s.order.filter(k => !unitMap[k]);
    s.order = s.order.filter(k => unitMap[k]);
    const added = units
        .filter(u => !s.order.includes(u.key))
        .sort((a, b) => new Date(a.acceptedAt || 0) - new Date(b.acceptedAt || 0));
    for (const u of added) {
        s.order.push(u.key);
        s.joinedAt = { ...s.joinedAt, [u.key]: now.toISOString() };
    }
    s.units = Object.fromEntries(units.map(u => [u.key, { name: u.name, captainName: u.captainName || null, members: u.members }]));
    const history = [...(s.history || [])];
    for (const k of removed) history.push({ at: now.toISOString(), type: 'LEAVE', a: k });
    for (const u of added) if (before) history.push({ at: now.toISOString(), type: 'JOIN', a: u.key, to: s.order.indexOf(u.key) + 1 });
    s.history = history.slice(-300);
    return { state: s, changed: before !== s.order.join('|') || removed.length > 0 || added.length > 0 };
}

export function emptyState() {
    return { order: [], units: {}, joinedAt: {}, lastMatchAt: {}, lastInactivityAt: {}, declinesUsed: {}, history: [] };
}

const daysMs = (d) => d * 86400000;

// challenges: bu turnuvanın DEFI maç satırları (p1Id = teklif eden anahtarı, p2Id = teklif alan).
export function checkChallenge({ state, settings, challenges, challengerKey, defenderKey, now = new Date(), seasonOver = false }) {
    if (seasonOver) return { ok: false, code: 'SEASON_OVER' };
    const order = state?.order || [];
    const ci = order.indexOf(challengerKey);
    const di = order.indexOf(defenderKey);
    if (ci < 0) return { ok: false, code: 'NOT_IN_LADDER' };
    if (di < 0) return { ok: false, code: 'TARGET_NOT_IN_LADDER' };
    if (challengerKey === defenderKey) return { ok: false, code: 'SELF' };
    if (di >= ci) return { ok: false, code: 'NOT_ABOVE' };
    if (ci - di > maxUpFor(ci + 1, settings)) return { ok: false, code: 'TOO_FAR' };
    const active = (k) => challenges.some(c => DEFI_ACTIVE_STATUSES.includes(c.status) && (c.p1Id === k || c.p2Id === k));
    if (active(challengerKey)) return { ok: false, code: 'YOU_BUSY' };
    if (active(defenderKey)) return { ok: false, code: 'TARGET_BUSY' };
    const protectedUntil = (k) => {
        const last = state.lastMatchAt?.[k];
        return last ? new Date(last).getTime() + daysMs(settings.protectionDays) : 0;
    };
    if (protectedUntil(challengerKey) > now.getTime()) return { ok: false, code: 'YOU_PROTECTED' };
    if (protectedUntil(defenderKey) > now.getTime()) return { ok: false, code: 'TARGET_PROTECTED' };
    if (settings.rematchDays > 0) {
        const recent = challenges.some(c => DEFI_DONE_STATUSES.includes(c.status)
            && ((c.p1Id === challengerKey && c.p2Id === defenderKey) || (c.p1Id === defenderKey && c.p2Id === challengerKey))
            && c.completedAt && now.getTime() - new Date(c.completedAt).getTime() < daysMs(settings.rematchDays));
        if (recent) return { ok: false, code: 'REMATCH_LOCK' };
    }
    return { ok: true };
}

// Teklif eden kazanırsa rakibin yerine geçer; rakip ve aradakiler birer basamak kayar.
export function applyResult(order, challengerKey, defenderKey, challengerWon) {
    const ci = order.indexOf(challengerKey);
    const di = order.indexOf(defenderKey);
    if (!challengerWon || ci < 0 || di < 0 || di >= ci) return [...order];
    const next = order.filter(k => k !== challengerKey);
    next.splice(di, 0, challengerKey);
    return next;
}

// Hareketsizlik cezası: inactivityDays boyunca defi maçı yapmayan bir basamak geriler. Referans an
// son maç / katılım / son ceza / sezon başlangıcının en geç olanı — ceza süresi her dolduğunda tekrar.
// Aktif defisi olanlara (teklif bekleyen, oynanacak maç) dokunulmaz.
export function applyInactivity(state, settings, activeKeys, now = new Date(), startedAt = null) {
    if (!settings.inactivityDays) return { state, moved: [] };
    const s = { ...state, order: [...state.order], lastInactivityAt: { ...(state.lastInactivityAt || {}) }, history: [...(state.history || [])] };
    const moved = [];
    const ref = (k) => Math.max(
        ...[s.lastMatchAt?.[k], s.joinedAt?.[k], s.lastInactivityAt[k], startedAt]
            .filter(Boolean).map(d => new Date(d).getTime()), 0);
    // Alttan yukarı: aynı turda iki hareketsiz komşu birbirinin yerini almasın diye.
    for (let i = s.order.length - 2; i >= 0; i--) {
        const k = s.order[i];
        if (activeKeys.has(k)) continue;
        if (now.getTime() - ref(k) < daysMs(settings.inactivityDays)) continue;
        const below = s.order[i + 1];
        s.order[i] = below;
        s.order[i + 1] = k;
        s.lastInactivityAt[k] = now.toISOString();
        s.history.push({ at: now.toISOString(), type: 'INACTIVITY', a: k, from: i + 1, to: i + 2 });
        moved.push(k);
    }
    s.history = s.history.slice(-300);
    return { state: s, moved };
}

// Merdiven satırı durumu (UI rozetleri için).
export function ladderView(state, settings, challenges, now = new Date()) {
    return (state.order || []).map((k, i) => {
        const active = challenges.find(c => DEFI_ACTIVE_STATUSES.includes(c.status) && (c.p1Id === k || c.p2Id === k));
        const last = state.lastMatchAt?.[k];
        const protectedUntil = last ? new Date(last).getTime() + daysMs(settings.protectionDays) : 0;
        const refs = [last, state.joinedAt?.[k], state.lastInactivityAt?.[k]].filter(Boolean).map(d => new Date(d).getTime());
        const idleDays = refs.length ? Math.floor((now.getTime() - Math.max(...refs)) / 86400000) : 0;
        return {
            rank: i + 1,
            key: k,
            name: state.units?.[k]?.name || '?',
            captainName: state.units?.[k]?.captainName || null,
            members: state.units?.[k]?.members || [],
            maxUp: maxUpFor(i + 1, settings),
            status: active ? 'in_challenge' : protectedUntil > now.getTime() ? 'protected' : 'available',
            protectedUntil: protectedUntil > now.getTime() ? new Date(protectedUntil).toISOString() : null,
            activeChallengeId: active?.id || null,
            lastMatchAt: last || null,
            idleDays,
            declinesLeft: Math.max(0, settings.declinesPerSeason - (state.declinesUsed?.[k] || 0)),
        };
    });
}
