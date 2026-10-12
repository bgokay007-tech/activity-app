import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';
import { UTR_SUBCATEGORIES, getDisplayRating, applyUtrRatingForTournamentMatch } from '../utils/utrRating.js';
import {
    DEFI_ENGINE_TYPE, DEFI_ACTIVE_STATUSES, sanitizeDefiSettings, buildUnits, initialOrder,
    syncLadder, emptyState, checkChallenge, applyResult, applyInactivity, ladderView, maxUpFor,
} from '../utils/defiLadder.js';

const SCORE_AUTO_CONFIRM_MS = 12 * 3600 * 1000;
const PHASE = 'DEFI';

const fail = (res, status, message, code) => res.status(status).json({ message, code });

export const isDefi = (t) => String(t?.type) === DEFI_ENGINE_TYPE;
export const defiSettingsOf = (t) => sanitizeDefiSettings(t?.formatConfig?.defi, t?.subCategory);

// Sezon sonu = tahmini bitiş tarihi (+ saat). Saat yoksa günün sonu (TR).
function seasonEndMs(t) {
    if (!t.eventEndDate) return null;
    const d = new Date(t.eventEndDate);
    const [h, m] = (t.eventEndTime || '23:59').split(':').map(Number);
    d.setUTCHours(h || 0, m || 0, 0, 0);
    return d.getTime() - 3 * 3600 * 1000;
}

async function loadParticipants(t, settings) {
    const parts = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: t.id, status: 'ACCEPTED', userId: { not: null } },
        include: {
            user: {
                select: {
                    id: true, username: true, fullName: true,
                    interests: { where: { category: t.category, subCategory: t.subCategory } },
                },
            },
        },
        orderBy: [{ acceptedAt: 'asc' }, { createdAt: 'asc' }],
    });
    for (const p of parts) {
        const i = p.user?.interests?.[0];
        p._rating = i ? getDisplayRating(i, t.subCategory, settings.entry === 'PAIR') : 0;
    }
    return parts;
}

const normalize = (m) => ({ ...m, completedAt: m.score?.completedAt || null });

async function loadChallenges(tournamentId) {
    const rows = await prisma.tournamentMatch.findMany({
        where: { tournamentId, phase: PHASE },
        orderBy: { createdAt: 'desc' },
    });
    return rows.map(normalize);
}

const stateOf = (t) => ({ ...emptyState(), ...(t.bracketData?.defi || {}) });

async function saveState(t, state, extra = {}) {
    return prisma.tournament.update({
        where: { id: t.id },
        data: { bracketData: { ...(t.bracketData || {}), defi: state }, ...extra },
    });
}

// Her işlemden önce: merdiveni kabul edilmiş katılımcılarla hizala.
async function syncedState(t, settings) {
    const parts = await loadParticipants(t, settings);
    const units = buildUnits(parts, settings.entry);
    const { state, changed } = syncLadder(stateOf(t), units);
    if (changed) await saveState(t, state);
    return { state, units };
}

const membersOf = (state, key) => state.units?.[key]?.members || [];
const nameOf = (state, key) => state.units?.[key]?.name || '?';
const keyOfUser = (state, userId) => state.order.find(k => membersOf(state, k).includes(userId)) || null;

function notifyKeys(t, state, keys, title, body, extraData = {}) {
    const uids = [...new Set(keys.flatMap(k => membersOf(state, k)))];
    for (const uid of uids) {
        emitToUser(uid, 'tournament:defi_updated', { tournamentId: t.id });
        createNotification(uid, 'TOURNAMENT_DEFI', title, body,
            { tournamentId: t.id, category: t.category, subCategory: t.subCategory, ...extraData }).catch(() => {});
    }
}

async function getDefiTournament(id) {
    const t = await prisma.tournament.findUnique({ where: { id } });
    if (!t || !isDefi(t)) return null;
    return t;
}

// tournament.controller.js runStartTournament'tan çağrılır — maç üretmez, sadece merdiveni kurar.
export async function startDefiLadder(tournament, { actorUserId = null } = {}) {
    const settings = defiSettingsOf(tournament);
    const parts = await loadParticipants(tournament, settings);
    const units = buildUnits(parts, settings.entry);
    if (units.length < Math.max(2, tournament.minPlayers || 2)) {
        throw Object.assign(new Error(`Defi ligini başlatmak için en az ${Math.max(2, tournament.minPlayers || 2)} ${settings.entry === 'TEAM' ? 'takım' : settings.entry === 'PAIR' ? 'çift' : 'oyuncu'} gerekli.`), { status: 400 });
    }
    const now = new Date();
    const order = initialOrder(units, settings.initialOrder);
    const state = {
        ...emptyState(),
        order,
        units: Object.fromEntries(units.map(u => [u.key, { name: u.name, captainName: u.captainName || null, members: u.members }])),
        joinedAt: Object.fromEntries(order.map(k => [k, now.toISOString()])),
        history: [{ at: now.toISOString(), type: 'START', mode: settings.initialOrder }],
    };
    await saveState(tournament, state, { status: 'IN_PROGRESS', startedAt: now });
    for (const u of units) {
        for (const uid of u.members) {
            if (uid === actorUserId) continue;
            emitToUser(uid, 'tournament:started', { tournamentId: tournament.id });
            createNotification(uid, 'TOURNAMENT_STARTED', '🪜 Defi Ligi Başladı',
                `"${tournament.name}" defi ligi başladı. Başlangıç sıran: ${order.indexOf(u.key) + 1}. Üstündekilere teklif ederek yüksel!`,
                { tournamentId: tournament.id, category: tournament.category, subCategory: tournament.subCategory }).catch(() => {});
        }
    }
    return prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: {
            creator: { select: { id: true, username: true, fullName: true } },
            _count: { select: { participants: { where: { status: 'ACCEPTED' } } } },
        },
    });
}

export const getDefiLadder = async (req, res, next) => {
    try {
        const t = await getDefiTournament(req.params.id);
        if (!t) return fail(res, 404, 'Defi ligi bulunamadı');
        const settings = defiSettingsOf(t);
        let state = stateOf(t);
        if (t.status === 'IN_PROGRESS') state = (await syncedState(t, settings)).state;
        const challenges = await loadChallenges(t.id);
        const now = new Date();
        const myKey = keyOfUser(state, req.userId);
        const seasonOver = t.status !== 'IN_PROGRESS';
        const ladder = ladderView(state, settings, challenges, now).map(row => ({
            ...row,
            canChallenge: !!myKey && checkChallenge({ state, settings, challenges, challengerKey: myKey, defenderKey: row.key, now, seasonOver }).ok,
        }));
        const pub = (c) => ({
            id: c.id, status: c.status, round: c.round,
            challengerKey: c.p1Id, challengerName: c.p1Name, defenderKey: c.p2Id, defenderName: c.p2Name,
            challengerRank: c.scheduleData?.ranks?.challenger ?? null, defenderRank: c.scheduleData?.ranks?.defender ?? null,
            deadline: c.deadline, score: c.score, winnerKey: c.winnerId, scoreEnteredBy: c.scoreEnteredBy,
            challengerConfirmed: c.p1Confirmed, defenderConfirmed: c.p2Confirmed,
            agreed: c.scheduleData?.agreed || null, createdAt: c.createdAt, completedAt: c.completedAt,
            challengerMembers: membersOf(state, c.p1Id), defenderMembers: membersOf(state, c.p2Id),
        });
        res.json({
            tournamentId: t.id,
            status: t.status,
            settings,
            seasonEnd: seasonEndMs(t) ? new Date(seasonEndMs(t)).toISOString() : null,
            myKey,
            ladder,
            active: challenges.filter(c => DEFI_ACTIVE_STATUSES.includes(c.status)).map(pub),
            recent: challenges.filter(c => !DEFI_ACTIVE_STATUSES.includes(c.status)).slice(0, 40).map(pub),
            history: (state.history || []).slice(-60).reverse(),
            final: state.final || null,
        });
    } catch (e) { next(e); }
};

export const createDefiChallenge = async (req, res, next) => {
    try {
        const t = await getDefiTournament(req.params.id);
        if (!t) return fail(res, 404, 'Defi ligi bulunamadı');
        if (t.status !== 'IN_PROGRESS') return fail(res, 400, 'Defi ligi şu an aktif değil');
        const settings = defiSettingsOf(t);
        const { state } = await syncedState(t, settings);
        const challengerKey = keyOfUser(state, req.userId);
        const { defenderKey } = req.body || {};
        const challenges = await loadChallenges(t.id);
        const now = new Date();
        const end = seasonEndMs(t);
        const chk = checkChallenge({ state, settings, challenges, challengerKey, defenderKey, now, seasonOver: !!end && end <= now.getTime() });
        const MSG = {
            SEASON_OVER: 'Sezon sona erdi',
            NOT_IN_LADDER: 'Bu ligin sıralamasında değilsin',
            TARGET_NOT_IN_LADDER: 'Rakip sıralamada bulunamadı',
            SELF: 'Kendine teklif edemezsin',
            NOT_ABOVE: 'Sadece üst sıradakilere teklif edebilirsin',
            YOU_BUSY: 'Zaten aktif bir defin var',
            TARGET_BUSY: 'Rakibin şu an başka bir defide',
            YOU_PROTECTED: 'Son maçından sonra korunma süresindesin',
            TARGET_PROTECTED: 'Rakip son maçından sonra korunma süresinde',
            REMATCH_LOCK: `Aynı rakiple ${settings.rematchDays} gün içinde tekrar defi yapılamaz`,
        };
        if (!chk.ok) {
            const ci = state.order.indexOf(challengerKey);
            const msg = chk.code === 'TOO_FAR'
                ? `Sıran (${ci + 1}) için en fazla ${maxUpFor(ci + 1, settings)} basamak yukarıya teklif edebilirsin`
                : MSG[chk.code];
            return fail(res, 400, msg, chk.code);
        }
        const round = (challenges.reduce((m, c) => Math.max(m, c.round || 0), 0)) + 1;
        const match = await prisma.tournamentMatch.create({
            data: {
                tournamentId: t.id, round, phase: PHASE, matchIndex: 0,
                p1Id: challengerKey, p1Name: nameOf(state, challengerKey),
                p2Id: defenderKey, p2Name: nameOf(state, defenderKey),
                status: 'DEFI_OFFERED',
                deadline: new Date(now.getTime() + settings.responseHours * 3600 * 1000),
                scheduleData: {
                    ranks: { challenger: state.order.indexOf(challengerKey) + 1, defender: state.order.indexOf(defenderKey) + 1 },
                    offeredBy: req.userId,
                    offeredAt: now.toISOString(),
                    proposal: req.body?.proposal || null,
                },
            },
        });
        notifyKeys(t, state, [defenderKey], '🪜 Defi Teklifi',
            `${nameOf(state, challengerKey)} (${state.order.indexOf(challengerKey) + 1}.) sana "${t.name}" ligi için defi teklif etti. ${settings.responseHours} saat içinde cevap vermezsen hükmen yenilmiş sayılırsın.`,
            { defiMatchId: match.id });
        notifyKeys(t, state, [challengerKey], '🪜 Defi Teklifin Gönderildi', `${nameOf(state, defenderKey)} cevabını bekliyorsun.`, { defiMatchId: match.id });
        res.status(201).json(normalize(match));
    } catch (e) { next(e); }
};

async function loadActionContext(req, res) {
    const t = await getDefiTournament(req.params.id);
    if (!t) { fail(res, 404, 'Defi ligi bulunamadı'); return null; }
    const settings = defiSettingsOf(t);
    const { state } = await syncedState(t, settings);
    const match = await prisma.tournamentMatch.findFirst({ where: { id: req.params.matchId, tournamentId: t.id, phase: PHASE } });
    if (!match) { fail(res, 404, 'Defi maçı bulunamadı'); return null; }
    const mySide = membersOf(state, match.p1Id).includes(req.userId) ? 'p1'
        : membersOf(state, match.p2Id).includes(req.userId) ? 'p2' : null;
    return { t, settings, state, match, mySide };
}

// Sonucu merdivene uygula. W.O. ve normal maç aynı yoldan geçer.
async function finalizeDefi(t, settings, state, match, { winnerSide, score = null, forfeit = false, reason = null }) {
    const now = new Date();
    const challengerWon = winnerSide === 'p1';
    const winnerKey = winnerSide === 'p1' ? match.p1Id : winnerSide === 'p2' ? match.p2Id : null;
    const before = [...state.order];
    const order = applyResult(state.order, match.p1Id, match.p2Id, challengerWon);
    const fromRank = before.indexOf(match.p1Id) + 1;
    const toRank = order.indexOf(match.p1Id) + 1;
    const nextState = {
        ...state,
        order,
        lastMatchAt: { ...state.lastMatchAt, [match.p1Id]: now.toISOString(), [match.p2Id]: now.toISOString() },
        history: [...(state.history || []), {
            at: now.toISOString(), type: forfeit ? 'WO' : 'RESULT', a: match.p1Id, b: match.p2Id,
            winner: winnerKey, from: fromRank, to: toRank, reason,
        }].slice(-300),
    };
    await prisma.tournamentMatch.update({
        where: { id: match.id },
        data: {
            status: forfeit ? 'FORFEIT' : 'COMPLETED',
            winnerId: winnerKey,
            score: { ...(score || match.score || {}), winner: winnerSide || 'draw', completedAt: now.toISOString(), ...(forfeit ? { forfeit: true, reason } : {}) },
            p1Confirmed: true, p2Confirmed: true,
            deadline: null,
        },
    });
    await saveState(t, nextState);

    // UTR dallarında (tenis/padel) gerçek maç puana işler; W.O. ve beraberlik işlemez.
    if (!forfeit && winnerSide && UTR_SUBCATEGORIES.includes(t.subCategory) && settings.entry !== 'TEAM') {
        const winnerMembers = membersOf(state, winnerKey);
        const loserMembers = membersOf(state, winnerSide === 'p1' ? match.p2Id : match.p1Id);
        if (winnerMembers.length && loserMembers.length) {
            applyUtrRatingForTournamentMatch({
                category: t.category, subCategory: t.subCategory,
                tournamentType: settings.entry === 'PAIR' ? '2' : '1',
                matchId: match.id, winnerMembers, loserMembers,
                sets: score?.sets || [], winnerSide,
            }).catch(err => console.error('[defi] rating', err.message));
        }
    }

    const cName = nameOf(state, match.p1Id), dName = nameOf(state, match.p2Id);
    const body = challengerWon
        ? `${cName}, ${dName} karşısında kazandı ve ${fromRank}. sıradan ${toRank}. sıraya yükseldi.${forfeit ? ` (Hükmen — ${reason || 'W.O.'})` : ''}`
        : winnerSide === 'p2'
            ? `${dName} ${before.indexOf(match.p2Id) + 1}. sıradaki yerini korudu. Sıralama değişmedi.`
            : 'Maç berabere bitti — sıralama değişmedi.';
    notifyKeys(t, nextState, [match.p1Id, match.p2Id], '🪜 Defi Sonucu', body, { defiMatchId: match.id });
    return nextState;
}

export const respondDefiChallenge = async (req, res, next) => {
    try {
        const ctx = await loadActionContext(req, res); if (!ctx) return;
        const { t, settings, state, match, mySide } = ctx;
        if (mySide !== 'p2') return fail(res, 403, 'Bu teklife sadece teklif edilen taraf cevap verebilir');
        if (match.status !== 'DEFI_OFFERED') return fail(res, 400, 'Bu teklif artık cevap beklemiyor');
        const { action, agreed } = req.body || {};
        const now = new Date();
        if (action === 'accept') {
            const cleanAgreed = agreed && typeof agreed === 'object'
                ? { date: agreed.date || null, time: agreed.time || null, venue: (agreed.venue || '').slice(0, 120) || null }
                : null;
            const offeredAt = match.scheduleData?.offeredAt ? new Date(match.scheduleData.offeredAt) : match.createdAt;
            const updated = await prisma.tournamentMatch.update({
                where: { id: match.id },
                data: {
                    status: 'DEFI_ACCEPTED',
                    deadline: new Date(new Date(offeredAt).getTime() + settings.playDays * 86400000),
                    scheduleData: { ...(match.scheduleData || {}), acceptedAt: now.toISOString(), agreed: cleanAgreed },
                },
            });
            notifyKeys(t, state, [match.p1Id], '✅ Defi Kabul Edildi',
                `${nameOf(state, match.p2Id)} teklifini kabul etti. Maç ${settings.playDays} gün içinde oynanmalı.${cleanAgreed?.date ? ` Önerilen: ${cleanAgreed.date} ${cleanAgreed.time || ''} ${cleanAgreed.venue || ''}` : ''}`,
                { defiMatchId: match.id });
            return res.json(normalize(updated));
        }
        if (action === 'decline') {
            const used = state.declinesUsed?.[match.p2Id] || 0;
            if (used < settings.declinesPerSeason) {
                const nextState = {
                    ...state,
                    declinesUsed: { ...state.declinesUsed, [match.p2Id]: used + 1 },
                    history: [...(state.history || []), { at: now.toISOString(), type: 'DECLINE', a: match.p1Id, b: match.p2Id }].slice(-300),
                };
                await saveState(t, nextState);
                const updated = await prisma.tournamentMatch.update({
                    where: { id: match.id },
                    data: { status: 'DEFI_DECLINED', deadline: null, score: { completedAt: now.toISOString() } },
                });
                notifyKeys(t, nextState, [match.p1Id], '❌ Defi Reddedildi',
                    `${nameOf(state, match.p2Id)} ret hakkını kullandı (kalan: ${settings.declinesPerSeason - used - 1}). Sıralama değişmedi.`,
                    { defiMatchId: match.id });
                return res.json(normalize(updated));
            }
            await finalizeDefi(t, settings, state, match, { winnerSide: 'p1', forfeit: true, reason: 'Ret hakkı bitti' });
            return res.json({ ok: true, forfeit: true });
        }
        return fail(res, 400, 'Geçersiz işlem');
    } catch (e) { next(e); }
};

export const cancelDefiChallenge = async (req, res, next) => {
    try {
        const ctx = await loadActionContext(req, res); if (!ctx) return;
        const { t, state, match, mySide } = ctx;
        const isCreator = t.creatorId === req.userId;
        if (mySide !== 'p1' && !isCreator) return fail(res, 403, 'Teklifi sadece teklif eden geri çekebilir');
        if (match.status !== 'DEFI_OFFERED' && !(isCreator && DEFI_ACTIVE_STATUSES.includes(match.status))) {
            return fail(res, 400, 'Kabul edilmiş defi geri çekilemez');
        }
        await prisma.tournamentMatch.update({
            where: { id: match.id },
            data: { status: 'DEFI_CANCELLED', deadline: null, score: { completedAt: new Date().toISOString() } },
        });
        notifyKeys(t, state, [match.p1Id, match.p2Id], '↩️ Defi Geri Çekildi', `${nameOf(state, match.p1Id)} → ${nameOf(state, match.p2Id)} defisi iptal edildi.`, { defiMatchId: match.id });
        res.json({ ok: true });
    } catch (e) { next(e); }
};

function cleanSets(sets) {
    if (!Array.isArray(sets)) return null;
    const out = sets
        .map(s => ({ p1: parseInt(s?.p1, 10), p2: parseInt(s?.p2, 10) }))
        .filter(s => Number.isFinite(s.p1) && Number.isFinite(s.p2) && s.p1 >= 0 && s.p2 >= 0 && s.p1 <= 200 && s.p2 <= 200);
    return out.length ? out.slice(0, 7) : null;
}

// Set sayısından (raket/voleybol) ya da tek "set" = skor (futbol/basketbol) kazananı çıkar.
function winnerFromSets(sets, isGoalSport) {
    if (isGoalSport) {
        const a = sets.reduce((s, x) => s + x.p1, 0), b = sets.reduce((s, x) => s + x.p2, 0);
        return a > b ? 'p1' : b > a ? 'p2' : 'draw';
    }
    let a = 0, b = 0;
    for (const s of sets) { if (s.p1 > s.p2) a++; else if (s.p2 > s.p1) b++; }
    return a > b ? 'p1' : b > a ? 'p2' : 'draw';
}

export const submitDefiScore = async (req, res, next) => {
    try {
        const ctx = await loadActionContext(req, res); if (!ctx) return;
        const { t, state, match, mySide } = ctx;
        if (!mySide) return fail(res, 403, 'Bu maçta değilsin');
        if (!['DEFI_ACCEPTED', 'DEFI_SCORED'].includes(match.status)) return fail(res, 400, 'Bu maç için skor girilemez');
        const sets = cleanSets(req.body?.sets);
        if (!sets) return fail(res, 400, 'Geçerli bir skor gir');
        const winner = winnerFromSets(sets, ['football', 'basketball'].includes(t.subCategory));
        if (winner === 'draw' && !['football'].includes(t.subCategory)) return fail(res, 400, 'Defi maçında kazanan belli olmalı');
        const updated = await prisma.tournamentMatch.update({
            where: { id: match.id },
            data: {
                status: 'DEFI_SCORED',
                score: { sets, winner },
                scoreEnteredBy: req.userId,
                scoreSubmittedAt: new Date(),
                p1Confirmed: mySide === 'p1',
                p2Confirmed: mySide === 'p2',
            },
        });
        const otherKey = mySide === 'p1' ? match.p2Id : match.p1Id;
        notifyKeys(t, state, [otherKey], '📝 Defi Skoru Girildi',
            `${nameOf(state, mySide === 'p1' ? match.p1Id : match.p2Id)} skoru girdi: ${sets.map(s => `${s.p1}-${s.p2}`).join(', ')}. Onayla ya da düzelt — 12 saat içinde otomatik onaylanır.`,
            { defiMatchId: match.id });
        res.json(normalize(updated));
    } catch (e) { next(e); }
};

export const confirmDefiScore = async (req, res, next) => {
    try {
        const ctx = await loadActionContext(req, res); if (!ctx) return;
        const { t, settings, state, match, mySide } = ctx;
        if (!mySide) return fail(res, 403, 'Bu maçta değilsin');
        if (match.status !== 'DEFI_SCORED') return fail(res, 400, 'Onaylanacak skor yok');
        if ((mySide === 'p1' && match.p1Confirmed) || (mySide === 'p2' && match.p2Confirmed)) {
            return fail(res, 400, 'Karşı tarafın onayı bekleniyor');
        }
        await finalizeDefi(t, settings, state, match, { winnerSide: match.score?.winner, score: match.score });
        res.json({ ok: true });
    } catch (e) { next(e); }
};

// Organizatör: sezonu erken bitir (sezon sonu tarihi gelince iş otomatik yapar).
export const finishDefiSeason = async (req, res, next) => {
    try {
        const t = await getDefiTournament(req.params.id);
        if (!t) return fail(res, 404, 'Defi ligi bulunamadı');
        if (t.creatorId !== req.userId) return fail(res, 403, 'Sadece organizatör sezonu bitirebilir');
        if (t.status !== 'IN_PROGRESS') return fail(res, 400, 'Lig zaten bitmiş');
        await closeDefiSeason(t);
        res.json({ ok: true });
    } catch (e) { next(e); }
};

async function closeDefiSeason(t) {
    const settings = defiSettingsOf(t);
    let { state } = await syncedState(t, settings);
    const challenges = await loadChallenges(t.id);
    // Onay bekleyen skorlar sayılır; oynanmamış defiler düşer.
    for (const c of challenges.filter(x => x.status === 'DEFI_SCORED')) {
        state = await finalizeDefi(t, settings, state, c, { winnerSide: c.score?.winner, score: c.score });
    }
    const open = challenges.filter(x => x.status === 'DEFI_OFFERED' || x.status === 'DEFI_ACCEPTED').map(x => x.id);
    if (open.length) {
        await prisma.tournamentMatch.updateMany({
            where: { id: { in: open } },
            data: { status: 'DEFI_EXPIRED', deadline: null },
        });
    }
    const now = new Date();
    const final = state.order.map((k, i) => ({ rank: i + 1, key: k, name: nameOf(state, k), members: membersOf(state, k) }));
    const fresh = await prisma.tournament.findUnique({ where: { id: t.id } });
    await saveState(fresh, { ...state, final, history: [...(state.history || []), { at: now.toISOString(), type: 'END' }].slice(-300) },
        { status: 'COMPLETED', completedAt: now });
    notifyKeys(t, state, state.order, '🏁 Defi Sezonu Bitti',
        `"${t.name}" sezonu sona erdi. Şampiyon: ${final[0]?.name || '-'}.`);
}

// Zamanlanmış iş (her 10 dk): cevapsız teklif → W.O., oynanmayan maç → düşer,
// onaysız skor → otomatik onay, hareketsizlik cezası, sezon sonu.
export async function runDefiMaintenance(now = new Date()) {
    const tournaments = await prisma.tournament.findMany({ where: { type: DEFI_ENGINE_TYPE, status: 'IN_PROGRESS' } });
    for (const t0 of tournaments) {
        try {
            let t = t0;
            const settings = defiSettingsOf(t);
            const end = seasonEndMs(t);
            if (end && end <= now.getTime()) { await closeDefiSeason(t); continue; }

            let { state } = await syncedState(t, settings);
            const challenges = await loadChallenges(t.id);
            for (const c of challenges) {
                if (c.status === 'DEFI_OFFERED' && c.deadline && new Date(c.deadline) <= now) {
                    t = await prisma.tournament.findUnique({ where: { id: t.id } });
                    state = await finalizeDefi(t, settings, state, c, { winnerSide: 'p1', forfeit: true, reason: 'Süresinde cevap verilmedi' });
                } else if (c.status === 'DEFI_ACCEPTED' && c.deadline && new Date(c.deadline) <= now) {
                    await prisma.tournamentMatch.update({
                        where: { id: c.id },
                        data: { status: 'DEFI_EXPIRED', deadline: null, score: { completedAt: now.toISOString() } },
                    });
                    notifyKeys(t, state, [c.p1Id, c.p2Id], '⌛ Defi Süresi Doldu',
                        `${c.p1Name} → ${c.p2Name} maçı ${settings.playDays} gün içinde oynanmadı. Teklif düştü, sıralama değişmedi.`, { defiMatchId: c.id });
                } else if (c.status === 'DEFI_SCORED' && c.scoreSubmittedAt && now - new Date(c.scoreSubmittedAt) >= SCORE_AUTO_CONFIRM_MS) {
                    t = await prisma.tournament.findUnique({ where: { id: t.id } });
                    state = await finalizeDefi(t, settings, state, c, { winnerSide: c.score?.winner, score: c.score });
                }
            }

            const fresh = await loadChallenges(t.id);
            const activeKeys = new Set(fresh.filter(c => DEFI_ACTIVE_STATUSES.includes(c.status)).flatMap(c => [c.p1Id, c.p2Id]));
            const { state: next, moved } = applyInactivity(state, settings, activeKeys, now, t.startedAt);
            if (moved.length) {
                t = await prisma.tournament.findUnique({ where: { id: t.id } });
                await saveState(t, next);
                notifyKeys(t, next, moved, '⬇️ Defi: Hareketsizlik',
                    `${settings.inactivityDays} gündür defi maçı yapmadığın için "${t.name}" ligide bir basamak geriledin.`);
            }
        } catch (err) {
            console.error('[defi] maintenance', t0.id, err.message);
        }
    }
}
