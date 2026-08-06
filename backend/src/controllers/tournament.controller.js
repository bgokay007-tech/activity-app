import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser, broadcast } from '../config/socket.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';
import { TENNIS_PADEL_SUBCATEGORIES, TENNIS_PADEL_DOMINANT_THRESHOLD, getTennisPadelEloDelta, getReassessmentFlags, MIN_MATCHES_FOR_TOURNAMENT } from '../utils/tennisElo.js';
import { computeTournamentPlacement } from './achievement.controller.js';
import { sanitizeExtraServices } from '../utils/extraServices.js';

// Geçerli turnuva türü ID'leri — bkz. mobil TOURN_TYPES. '1' (Bireysel Rekabetçi), '2'
// (Çiftler Rekabetçi), '3' (Bireysel Antrenman) ve '4' (Çiftler Antrenman) tam olarak
// kurallandırılmış/skorlanabilir; '5'-'8' zamanla gerçek formatlara dönüştürülecek yer
// tutuculardır, ama anketlerde ve doğrudan seçimde şimdiden kullanılabilir.
export const VALID_TOURN_TYPES = ['1', '2', '3', '4', '5', '6', '7', '8'];

// Turnuva başlangıç tarihini Turkey local time (UTC+3) olarak döner
export function tournamentBaseDate(tournament) {
    if (!tournament.eventDate) return new Date();
    const dateStr = new Date(tournament.eventDate).toISOString().split('T')[0];
    const timeStr = tournament.eventTime || '00:00';
    return new Date(`${dateStr}T${timeStr}:00+03:00`);
}

// Tür anketi bitiş zamanını Turkey local time (UTC+3) olarak döner
export function tournamentPollDeadline(tournament) {
    if (!tournament.pollEndDate) return new Date();
    const dateStr = new Date(tournament.pollEndDate).toISOString().split('T')[0];
    const timeStr = tournament.pollEndTime || '00:00';
    return new Date(`${dateStr}T${timeStr}:00+03:00`);
}

// ─── Tournament bracket helpers ───────────────────────────────────────────────

function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Random group matches: each player plays `matchesPerPlayer` rounds, pairings randomised */
function randomMatches(players, tournamentId, matchesPerPlayer) {
    const k = Math.min(matchesPerPlayer, players.length - 1);
    const played = new Set();
    const result = [];
    for (let round = 1; round <= k; round++) {
        const pool = shuffle(players);
        const unmatched = new Set(pool.map(p => p.id));
        const roundPairs = [];
        for (const player of pool) {
            if (!unmatched.has(player.id)) continue;
            const candidates = pool.filter(p => p.id !== player.id && unmatched.has(p.id));
            for (const opp of candidates) {
                const key = [player.id, opp.id].sort().join('|');
                if (played.has(key)) continue;
                played.add(key);
                unmatched.delete(player.id);
                unmatched.delete(opp.id);
                roundPairs.push({ p1: player, p2: opp });
                break;
            }
        }
        roundPairs.forEach((pair, idx) => result.push({
            tournamentId, round, phase: 'GROUP', matchIndex: idx,
            p1Id: pair.p1.id, p1Name: pair.p1.fullName || pair.p1.username,
            p2Id: pair.p2.id, p2Name: pair.p2.fullName || pair.p2.username,
            status: 'PENDING',
        }));
    }
    return result;
}

/** Seeded group matches: best vs worst, 2nd best vs 2nd worst, etc. */
function seededMatches(players, tournamentId, matchesPerPlayer) {
    const k = Math.min(matchesPerPlayer, players.length - 1);
    // Sort descending by rating
    const sorted = [...players].sort((a, b) => (b.skillRating || 0) - (a.skillRating || 0));
    const played = new Set();
    const result = [];
    for (let round = 1; round <= k; round++) {
        const len = sorted.length;
        const roundPairs = [];
        // Rotate the “tail” each round so pairings change
        const tail = sorted.slice(Math.ceil(len / 2));
        const rotatedTail = [...tail.slice(round % tail.length), ...tail.slice(0, round % tail.length)];
        const bottom = [...rotatedTail, ...sorted.slice(Math.ceil(len / 2) + rotatedTail.length - tail.length)];
        const top = sorted.slice(0, Math.ceil(len / 2));
        for (let i = 0; i < Math.min(top.length, bottom.length); i++) {
            const p1 = top[i], p2 = bottom[i];
            if (!p1 || !p2 || p1.id === p2.id) continue;
            const key = [p1.id, p2.id].sort().join('|');
            if (played.has(key)) continue;
            played.add(key);
            roundPairs.push({ p1, p2 });
        }
        roundPairs.forEach((pair, idx) => result.push({
            tournamentId, round, phase: 'GROUP', matchIndex: idx,
            p1Id: pair.p1.id, p1Name: pair.p1.fullName || pair.p1.username,
            p2Id: pair.p2.id, p2Name: pair.p2.fullName || pair.p2.username,
            status: 'PENDING',
        }));
    }
    return result;
}

/**
 * ELO-based group matches: each player plays `matchesPerPlayer` matches
 * against their closest-skill opponents. Rounds are greedy-scheduled so
 * no player appears twice in the same round.
 */
function eloBasedMatches(players, tournamentId, matchesPerPlayer) {
    const k = Math.min(matchesPerPlayer, players.length - 1);
    const sorted = [...players].sort((a, b) => (a.skillRating || 0) - (b.skillRating || 0));
    const played = new Set(); // "id1|id2" pairs already scheduled across all rounds
    const result = [];

    for (let round = 1; round <= k; round++) {
        const unmatched = new Set(sorted.map(p => p.id));
        const roundPairs = [];

        for (const player of sorted) {
            if (!unmatched.has(player.id)) continue;
            // Find closest-ELO opponent: not played before, not already matched this round
            const candidates = sorted
                .filter(p => p.id !== player.id && unmatched.has(p.id))
                .map(p => ({ ...p, d: Math.abs((p.skillRating || 0) - (player.skillRating || 0)) }))
                .sort((a, b) => a.d - b.d);
            for (const opp of candidates) {
                const key = [player.id, opp.id].sort().join('|');
                if (played.has(key)) continue;
                played.add(key);
                unmatched.delete(player.id);
                unmatched.delete(opp.id);
                roundPairs.push({ p1: player, p2: opp });
                break;
            }
        }

        roundPairs.forEach((pair, idx) => {
            result.push({
                tournamentId, round, phase: 'GROUP', matchIndex: idx,
                p1Id: pair.p1.id, p1Name: pair.p1.fullName || pair.p1.username,
                p2Id: pair.p2.id, p2Name: pair.p2.fullName || pair.p2.username,
                status: 'PENDING',
            });
        });
    }

    return result;
}

/** Single-elimination bracket â€” all rounds pre-created with TBD slots */
function singleElimMatches(players, tournamentId, startRound = 1, phase = 'PLAYOFF') {
    const sorted = [...players].sort((a, b) => (b.skillRating || 0) - (a.skillRating || 0));
    const size = nextPow2(sorted.length);
    const totalRounds = Math.log2(size);
    const seeded = [...sorted, ...Array(size - sorted.length).fill(null)];
    const all = [];

    // Round 1: seeded matches
    for (let i = 0; i < size / 2; i++) {
        const p1 = seeded[i], p2 = seeded[size - 1 - i];
        const isBye = !p1 || !p2;
        const real = p1 || p2;
        all.push({
            tournamentId, round: startRound, phase, matchIndex: i,
            p1Id:   isBye ? null : p1?.id,   p1Name: isBye ? null : (p1?.fullName || p1?.username),
            p2Id:   isBye ? null : p2?.id,   p2Name: isBye ? null : (p2?.fullName || p2?.username),
            status:   isBye ? 'BYE' : 'PENDING',
            winnerId: isBye ? real?.id : null,
        });
    }
    // Later rounds: TBD
    for (let r = 2; r <= totalRounds; r++) {
        const cnt = size / Math.pow(2, r);
        for (let i = 0; i < cnt; i++) {
            all.push({ tournamentId, round: startRound + r - 1, phase, matchIndex: i, status: 'PENDING' });
        }
    }
    return all;
}

// Play-off turunun rakipleri kura/eleme anında belli olur (sonraki turlar TBD slot
// olarak oluşturulduğu için her iki taraf da atanıp maç gerçekten OYNANABİLİR hale
// gelene kadar beklenir). Deadline HEMEN verilmez — turnuva sahibine bu tur için
// kendi tarih aralığını atayabilmesi adına 3 günlük bir pencere tanınır (bkz.
// assignPlayoffRoundDeadline / autoAssignPlayoffDeadlines'daki 3+7 günlük mantık);
// bu yüzden burada sadece "hazır olma anı" damgalanır, deadline cron/creator atayana kadar boş kalır.
async function markPlayoffMatchReadyDeadline(matchId) {
    const m = await prisma.tournamentMatch.findUnique({
        where: { id: matchId }, select: { p1Id: true, p2Id: true, deadline: true, readyAt: true, status: true },
    });
    if (m && m.status === 'PENDING' && m.p1Id && m.p2Id && !m.deadline && !m.readyAt) {
        await prisma.tournamentMatch.update({ where: { id: matchId }, data: { readyAt: new Date() } });
    }
}

/** Deterministic, fair last-resort tiebreaker: a stable hash of (tournamentId + playerId)
 *  acts like a transparent, reproducible kura (lot draw) when all real stats are tied —
 *  nobody is systematically favored, and the result doesn't shift on every reload. */
function stableTiebreakHash(tournamentId, playerId) {
    const str = `${tournamentId}:${playerId}`;
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
}

/** Real-stat comparator (puan → averaj → set oranı → game oranı), without the final kura
 *  fallback. Returns 0 only when two standings rows are genuinely indistinguishable —
 *  used to detect a tie straddling the playoff cutoff so an extra round can be played
 *  instead of deciding qualification by lot. */
function compareStandingsCore(a, b, tournamentType) {
    if (b.points !== a.points) return b.points - a.points;
    if (tournamentType === '1' || tournamentType === '2' || tournamentType === '3' || tournamentType === '4') {
        const averaj = (x) => {
            const total = x.gamesWon + x.gamesLost;
            return total === 0 ? 0 : x.gamesWon / total;
        };
        if (Math.abs(averaj(b) - averaj(a)) > 0.001) return averaj(b) - averaj(a);
    }
    const sr = (x) => x.setsLost === 0 ? (x.setsWon === 0 ? 0 : Infinity) : x.setsWon / x.setsLost;
    if (Math.abs(sr(b) - sr(a)) > 0.001) return sr(b) - sr(a);
    const gr = (x) => x.gamesLost === 0 ? (x.gamesWon === 0 ? 0 : Infinity) : x.gamesWon / x.gamesLost;
    if (gr(b) !== gr(a)) return gr(b) - gr(a);
    return 0;
}

/** Compute GROUP-phase standings from completed matches.
 *  Tiebreaker for type '1' (Bireysel Rekabetçi): puan → averaj (gamesWon/totalGames) → set oranı
 *  → game oranı → (hepsi de eşitse) sabit kura
 */
function computeStandings(players, matches, tournamentType, tournamentId) {
    const stats = {};
    for (const p of players) {
        stats[p.id] = { userId: p.id, name: p.fullName || p.username, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 0 };
    }
    for (const m of matches) {
        if ((m.status !== 'COMPLETED' && m.status !== 'FORFEIT') || !m.score || m.phase !== 'GROUP') continue;
        const sc = m.score;
        const s1 = stats[m.p1Id], s2 = stats[m.p2Id];
        if (!s1 || !s2) continue;
        s1.played++; s2.played++;
        let p1s = 0, p2s = 0, p1g = 0, p2g = 0;
        for (const set of (sc.sets || [])) {
            p1g += set.p1 || 0; p2g += set.p2 || 0;
            if ((set.p1 || 0) > (set.p2 || 0)) p1s++; else if ((set.p2 || 0) > (set.p1 || 0)) p2s++;
        }
        s1.setsWon += p1s; s1.setsLost += p2s; s1.gamesWon += p1g; s1.gamesLost += p2g;
        s2.setsWon += p2s; s2.setsLost += p1s; s2.gamesWon += p2g; s2.gamesLost += p1g;
        if (sc.winner === 'p1') { s1.won++; s1.points += 3; s2.lost++; }
        else if (sc.winner === 'p2') { s2.won++; s2.points += 3; s1.lost++; }
    }
    return Object.values(stats).sort((a, b) => {
        const core = compareStandingsCore(a, b, tournamentType);
        if (core !== 0) return core;
        if (!tournamentId) return 0;
        return stableTiebreakHash(tournamentId, b.userId) - stableTiebreakHash(tournamentId, a.userId);
    });
}

/**
 * Pairs candidates by closest skillRating, never repeating a pair already in playedPairKeys.
 * Uses backtracking (most-constrained-player-first) instead of pure greedy: a naive greedy
 * nearest-ELO pass can paint itself into a corner and leave players unmatched even when a
 * valid full pairing exists for the round. Backtracking guarantees a full pairing is found
 * whenever one exists, leaving at most one player without an opponent (odd headcount).
 */
function pairByClosestElo(players, playedPairKeys) {
    const played = new Set(playedPairKeys);
    const byId = new Map(players.map(p => [p.id, p]));

    const validOpponents = (id, pool) => pool
        .filter(oid => oid !== id && !played.has([id, oid].sort().join('|')))
        .sort((a, b) => Math.abs((byId.get(a).skillRating || 0) - (byId.get(id).skillRating || 0))
            - Math.abs((byId.get(b).skillRating || 0) - (byId.get(id).skillRating || 0)));

    function search(pool) {
        if (pool.length <= 1) return { pairs: [], leftover: pool };
        let pivot = null, pivotCands = null;
        for (const id of pool) {
            const cands = validOpponents(id, pool);
            if (pivotCands === null || cands.length < pivotCands.length) {
                pivot = id; pivotCands = cands;
                if (cands.length === 0) break;
            }
        }
        for (const opp of pivotCands) {
            const rest = pool.filter(x => x !== pivot && x !== opp);
            const sub = search(rest);
            if (sub.leftover.length === 0) {
                return { pairs: [[pivot, opp], ...sub.pairs], leftover: [] };
            }
        }
        const rest = pool.filter(x => x !== pivot);
        const sub = search(rest);
        return { pairs: sub.pairs, leftover: [pivot, ...sub.leftover] };
    }

    const { pairs } = search(players.map(p => p.id));
    return pairs.map(([a, b]) => ({ p1: byId.get(a), p2: byId.get(b) }));
}

/**
 * Full round-robin for Çiftler Rekabetçi (type '2').
 * Generates ALL N-1 rounds upfront so every team meets every other team exactly once.
 *
 * Algorithm:
 *   1. Circle method — a well-known algorithm that guarantees a complete, valid
 *      round-robin schedule (no team appears twice in the same round, every pair
 *      plays exactly once). Teams are first sorted ascending by ELO so adjacent
 *      teams in the circle are similar in skill.
 *   2. Sort the generated rounds by average ELO diff (ascending) so round 1
 *      always contains the globally closest-rated pairings.
 */
function fullRoundRobinByElo(teams, tournamentId, baseDate) {
    const n = teams.length;
    if (n < 2) return [];

    // Sort by ELO ascending so adjacent circle positions are similar in skill
    const sorted = [...teams].sort((a, b) => (a.skillRating || 0) - (b.skillRating || 0));

    // Pad to even count with a null "bye" placeholder if odd
    const padded = sorted.length % 2 === 0 ? [...sorted] : [...sorted, null];
    const m = padded.length; // always even
    const totalRounds = m - 1;

    // Circle method: fix padded[0], rotate padded[1..m-1] each round
    const rotating = padded.slice(1); // length = m-1
    const roundSets = [];

    for (let r = 0; r < totalRounds; r++) {
        const pairs = [];
        const fixed = padded[0];
        if (fixed !== null && rotating[0] !== null) {
            pairs.push({ a: fixed, b: rotating[0] });
        }
        for (let i = 1; i < m / 2; i++) {
            const x = rotating[i];
            const y = rotating[m - 1 - i]; // rotating has indices 0..m-2
            if (x !== null && y !== null) pairs.push({ a: x, b: y });
        }
        roundSets.push(pairs);
        // Rotate: move last element to front
        rotating.unshift(rotating.pop());
    }

    // Sort rounds so the closest-rated pairings come first
    roundSets.sort((ra, rb) => {
        const avg = (pairs) => pairs.length === 0 ? Infinity
            : pairs.reduce((s, p) => s + Math.abs((p.a.skillRating || 0) - (p.b.skillRating || 0)), 0) / pairs.length;
        return avg(ra) - avg(rb);
    });

    // Convert to match records with per-round deadlines (7 days per round)
    const matches = [];
    for (let r = 0; r < roundSets.length; r++) {
        const pairs = roundSets[r];
        if (pairs.length === 0) continue;
        const deadline = new Date(baseDate);
        deadline.setDate(deadline.getDate() + (r + 1) * 7);
        pairs.forEach((pair, idx) => {
            matches.push({
                tournamentId,
                round: r + 1,
                phase: 'GROUP',
                matchIndex: idx,
                p1Id: pair.a.id,
                p1Name: pair.a.fullName || pair.a.username,
                p2Id: pair.b.id,
                p2Name: pair.b.fullName || pair.b.username,
                status: 'PENDING',
                deadline,
            });
        });
    }
    return matches;
}

async function getCurrentPlayerRatings(tournament, userIds) {
    const participants = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: tournament.id, status: 'ACCEPTED', userId: { in: userIds } },
        include: {
            user: {
                select: {
                    id: true, username: true, fullName: true,
                    interests: {
                        where: { category: tournament.category, subCategory: tournament.subCategory },
                        select: { skillRating: true },
                    },
                },
            },
        },
    });
    return participants.filter(p => p.userId && p.user).map(p => ({
        id: p.userId,
        fullName: p.user.fullName || null,
        username: p.user.username || null,
        skillRating: p.user.interests?.[0]?.skillRating || 0,
    }));
}

// Çiftler Rekabetçi (type '2'): takımın güncel ortalama ELO'su — üyelerin o anki skillRating'inden hesaplanır.
async function getCurrentTeamRatings(tournament, teamIds) {
    const teams = await prisma.tournamentTeam.findMany({ where: { id: { in: teamIds } } });
    const memberIds = [...new Set(teams.flatMap(t => [t.player1Id, t.player2Id]))];
    const interests = await prisma.userInterest.findMany({
        where: { userId: { in: memberIds }, category: tournament.category, subCategory: tournament.subCategory },
    });
    const ratingOf = (uid) => interests.find(i => i.userId === uid)?.skillRating || 0;
    return teams.map(t => ({
        id: t.id,
        fullName: `${t.player1Name} & ${t.player2Name}`,
        username: `${t.player1Name} & ${t.player2Name}`,
        skillRating: (ratingOf(t.player1Id) + ratingOf(t.player2Id)) / 2,
    }));
}

/** Bireysel Rekabetçi (type '1') ve Çiftler Rekabetçi (type '2'): DB'den güncel ELO
 *  alarak sonraki GROUP turunu oluşturur. Daha önce eşleşmiş çiftleri/takımları tekrar
 *  eşleştirmez. Deadline = eventDate + round*7 gün.
 */
async function generateNextEloRound(tournament, nextRound, playedPairKeys) {
    // 1. turdaki taraf ID'lerini al — sonradan eklenen katılımcılar/takımlar dahil edilmez
    const round1Matches = await prisma.tournamentMatch.findMany({
        where: { tournamentId: tournament.id, phase: 'GROUP', round: 1 },
        select: { p1Id: true, p2Id: true },
    });
    const originalIds = new Set();
    round1Matches.forEach(m => {
        if (m.p1Id) originalIds.add(m.p1Id);
        if (m.p2Id) originalIds.add(m.p2Id);
    });

    const players = (tournament.type === '2' || tournament.type === '4')
        ? await getCurrentTeamRatings(tournament, [...originalIds])
        : await getCurrentPlayerRatings(tournament, [...originalIds]);

    const roundPairs = pairByClosestElo(players, playedPairKeys);

    const baseDate = tournamentBaseDate(tournament);
    const deadline = new Date(baseDate);
    deadline.setDate(deadline.getDate() + nextRound * 7);

    return roundPairs.map((pair, idx) => ({
        tournamentId: tournament.id,
        round: nextRound,
        phase: 'GROUP',
        matchIndex: idx,
        p1Id: pair.p1.id,
        p1Name: pair.p1.fullName || pair.p1.username,
        p2Id: pair.p2.id,
        p2Name: pair.p2.fullName || pair.p2.username,
        status: 'PENDING',
        deadline,
    }));
}

// Çiftler Rekabetçi (type '2'): kabul edilmiş katılımcılardan takım oluşturur.
// Önce karşılıklı partner seçimi yapanları eşler, kalan bireysel başvuranları ELO'ya
// göre en yakın olandan başlayarak ikişerli gruplar.
// Bireysel başvuranları ELO'ya en yakın olandan eşleştirir; aynı takımda iki kadın
// oluşmasına izin vermez (Rule 2). Eşi bulunamayan kalırsa (tek sayı veya cinsiyet
// uyumsuzluğu) en düşük ELO'lu olandan başlayarak dışarıda bırakılır (Rule 1).
// random=true: takım eşleşmesi ELO değil, rastgele kura ile yapılır (Çiftler Antrenman, type '4').
function pairSoloPlayers(solo, avoidSameGenderFemale, random = false) {
    let pool = random ? shuffle(solo) : [...solo].sort((a, b) => a.rating - b.rating);
    const pairs = [];
    const excluded = [];

    while (pool.length > 1) {
        const a = pool[0];
        const rest = pool.slice(1);
        const compatible = rest.filter(b => !(avoidSameGenderFemale && a.gender === 'FEMALE' && b.gender === 'FEMALE'));
        if (compatible.length === 0) {
            excluded.push(a);
            pool = rest;
            continue;
        }
        const partner = random ? compatible[0]
            : [...compatible].sort((x, y) => Math.abs(x.rating - a.rating) - Math.abs(y.rating - a.rating))[0];
        pairs.push([a, partner]);
        pool = pool.filter(p => p.userId !== a.userId && p.userId !== partner.userId);
    }
    if (pool.length === 1) excluded.push(pool[0]);

    return { pairs, excluded };
}

// `acceptedList` = TÜM kabul edilmiş başvuranlar (maxPlayers'a göre kesilmemiş).
// Eşleştirme tüm havuzda yapılır, sonra sonuç maxPlayers/2 takıma göre kesilir —
// böylece ilk maxPlayers içinde eşi bulunamayan biri, sıradaki yedeklerden uygun
// bir eş varsa onunla eşleşip turnuvaya girebilir; kapasite sınırı yine de korunur.
// random=true: bireysel başvuranlar ELO yerine rastgele eşleştirilir (type '4').
async function formTeamsForTournament(tournament, acceptedList, random = false) {
    const byUserId = new Map(acceptedList.filter(p => p.userId).map(p => [p.userId, p]));
    const ratingOf = (p) => p.user?.interests?.[0]?.skillRating || 0;
    const nameOf   = (p) => p.user?.fullName || p.user?.username || 'Oyuncu';
    const genderOf = (p) => p.user?.gender || null;
    const orderOf  = (p) => (p.acceptedAt || p.createdAt)?.getTime() ?? Infinity;
    const paired = new Set();
    const teamsData = [];

    for (const p of acceptedList) {
        if (!p.userId || paired.has(p.userId) || !p.partnerId) continue;
        const partner = byUserId.get(p.partnerId);
        if (partner && partner.partnerId === p.userId && !paired.has(partner.userId)) {
            paired.add(p.userId); paired.add(partner.userId);
            teamsData.push({
                tournamentId: tournament.id,
                player1Id: p.userId, player1Name: nameOf(p),
                player2Id: partner.userId, player2Name: nameOf(partner),
                avgRating: (ratingOf(p) + ratingOf(partner)) / 2,
                _order: Math.min(orderOf(p), orderOf(partner)),
            });
        }
    }

    const solo = acceptedList
        .filter(p => p.userId && !paired.has(p.userId))
        .map(p => ({ userId: p.userId, name: nameOf(p), rating: ratingOf(p), gender: genderOf(p), order: orderOf(p) }));

    const { pairs, excluded } = pairSoloPlayers(solo, tournament.genderType === 'MIX', random);
    for (const [a, b] of pairs) {
        teamsData.push({
            tournamentId: tournament.id,
            player1Id: a.userId, player1Name: a.name,
            player2Id: b.userId, player2Name: b.name,
            avgRating: (a.rating + b.rating) / 2,
            _order: Math.min(a.order, b.order),
        });
    }

    // Kapasite: maxPlayers/2 takım. Havuzda kapasiteden fazla eşleşme oluştuysa,
    // en erken kabul edilenler önceliklidir — fazlalık bu turda yer alamaz (yedek).
    const maxTeams = tournament.maxPlayers ? Math.floor(tournament.maxPlayers / 2) : teamsData.length;
    teamsData.sort((a, b) => a._order - b._order);
    const finalTeams = teamsData.slice(0, maxTeams);
    for (const ex of excluded) ex.reason = 'no_partner';
    for (const bumped of teamsData.slice(maxTeams)) {
        excluded.push({ userId: bumped.player1Id, name: bumped.player1Name, reason: 'capacity' });
        excluded.push({ userId: bumped.player2Id, name: bumped.player2Name, reason: 'capacity' });
    }
    for (const team of finalTeams) delete team._order;

    return { teamsData: finalTeams, excluded };
}

export const fixGroupDeadlines = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        const isCreator = tournament.creatorId === req.userId;
        if (!isCreator) {
            const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
            if (!u?.isAdmin) return res.status(403).json({ message: 'Not authorized' });
        }
        if (!tournament.eventDate) return res.status(400).json({ message: 'Turnuvada başlangıç tarihi yok' });

        const base = tournamentBaseDate(tournament);

        const groupMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id, phase: 'GROUP' },
        });

        const updates = groupMatches
            .filter(m => m.round)
            .map(m => {
                const deadline = new Date(base);
                deadline.setDate(deadline.getDate() + m.round * 7);
                return prisma.tournamentMatch.update({ where: { id: m.id }, data: { deadline } });
            });

        await Promise.all(updates);

        const updated = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });
        res.json({ fixed: updates.length, matches: updated });
    } catch (error) { next(error); }
};

export const regenCurrentGroupRound = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        const isCreator = tournament.creatorId === req.userId;
        if (!isCreator) {
            const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
            if (!u?.isAdmin) return res.status(403).json({ message: 'Not authorized' });
        }

        const allGroupMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id, phase: 'GROUP' },
        });
        if (allGroupMatches.length === 0) return res.status(400).json({ message: 'GROUP maç yok' });

        const maxRound = Math.max(...allGroupMatches.map(m => m.round));
        if (maxRound <= 1) return res.status(400).json({ message: '1. turdan sonraki bir tur yok' });

        const currentRoundMatches = allGroupMatches.filter(m => m.round === maxRound);
        const hasPlayed = currentRoundMatches.some(m => m.status === 'COMPLETED' || m.status === 'FORFEIT');
        if (hasPlayed) return res.status(400).json({ message: 'Bu turun bazı maçları oynanmış, silinemez' });

        // Önceki turlardan oynanan çiftler
        const playedPairKeys = allGroupMatches
            .filter(m => m.round < maxRound && m.p1Id && m.p2Id)
            .map(m => [m.p1Id, m.p2Id].sort().join('|'));

        // Mevcut yanlış turu sil
        await prisma.tournamentMatch.deleteMany({ where: { tournamentId: id, phase: 'GROUP', round: maxRound } });

        // Doğru oyuncularla yeniden üret (generateNextEloRound round 1 ID'lerini kullanır)
        const newMatches = await generateNextEloRound(tournament, maxRound, playedPairKeys);
        if (newMatches.length === 0) return res.status(400).json({ message: 'Eşleşecek oyuncu bulunamadı' });

        await prisma.tournamentMatch.createMany({ data: newMatches });

        const updated = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });
        res.json(updated);
    } catch (error) { next(error); }
};

export const createTournament = async (req, res, next) => {
    try {
        const creator = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        if (!creator?.isAdmin) {
            const now = new Date();
            const sub = await prisma.businessSubscription.findFirst({
                where: { userId: req.userId, status: 'ACTIVE', endDate: { gt: now } },
            });
            if (!sub) {
                return res.status(403).json({ message: 'Turnuva oluşturmak için aktif Başlangıç Paketi gereklidir.' });
            }
        }
        const {
            name, type, category, subCategory, description,
            scope, genderType, isPaid, feeType, playerFee, paymentMethod, ibanNumber, ibanHolder,
            prize1, prize2, prize3, surpriseGifts, contactPhone,
            minPlayers, maxPlayers, minRating, maxRating,
            ratingGenderSplit, minRatingMale, maxRatingMale, minRatingFemale, maxRatingFemale,
            matchmakingType, matchFrequency, matchTimeStart, matchTimeEnd, dayTrip,
            setsPerMatch, advantageScoring, matchesBeforePlayoff, playoffQualifiers,
            teamSize, teamRequiredMaleCount,
            rules, extraServices,
            location, city,
            surface, isIndoor,
            eventDate, eventTime, eventEndDate, eventEndTime,
            startDate, startTime, endDate, endTime,
            pollEnabled, pollEndDate, pollEndTime, pollTypes,
        } = req.body;
        if (pollEnabled === true && !pollEndDate) {
            return res.status(400).json({ message: 'Anket bitiş tarihi zorunludur.' });
        }
        let cleanExtraServices = [];
        if (extraServices !== undefined) {
            cleanExtraServices = sanitizeExtraServices(extraServices);
            if (cleanExtraServices === null) return res.status(400).json({ message: 'Geçersiz ekstra hizmet' });
        }
        let validPollTypes = null;
        if (pollEnabled === true) {
            const uniq = Array.isArray(pollTypes) ? [...new Set(pollTypes)].filter(tp => VALID_TOURN_TYPES.includes(tp)) : [];
            if (uniq.length < 2) {
                return res.status(400).json({ message: 'Anket için en az 2 turnuva türü seçmelisiniz.' });
            }
            validPollTypes = uniq;
        }
        const tournament = await prisma.tournament.create({
            data: {
                name,
                type: pollEnabled === true ? null : (type || '1'),
                status: pollEnabled === true ? 'POLL' : 'OPEN',
                pollEndDate: pollEnabled === true ? new Date(pollEndDate) : null,
                pollEndTime: pollEnabled === true ? (pollEndTime || null) : null,
                pollTypes: validPollTypes,
                category,
                subCategory,
                description: description || null,
                scope: scope || 'YEREL',
                genderType: genderType || 'MIX',
                isPaid: isPaid === true,
                feeType: feeType || null,
                playerFee: playerFee ? parseFloat(playerFee) : null,
                paymentMethod: paymentMethod || null,
                ibanNumber: ibanNumber || null,
                ibanHolder: ibanHolder || null,
                prize1: prize1 || null,
                prize2: prize2 || null,
                prize3: prize3 || null,
                surpriseGifts: surpriseGifts || null,
                contactPhone: contactPhone || null,
                minRating: minRating !== undefined && minRating !== '' ? parseFloat(minRating) : null,
                maxRating: maxRating !== undefined && maxRating !== '' ? parseFloat(maxRating) : null,
                ratingGenderSplit: !!ratingGenderSplit,
                minRatingMale: minRatingMale !== undefined && minRatingMale !== '' ? parseFloat(minRatingMale) : null,
                maxRatingMale: maxRatingMale !== undefined && maxRatingMale !== '' ? parseFloat(maxRatingMale) : null,
                minRatingFemale: minRatingFemale !== undefined && minRatingFemale !== '' ? parseFloat(minRatingFemale) : null,
                maxRatingFemale: maxRatingFemale !== undefined && maxRatingFemale !== '' ? parseFloat(maxRatingFemale) : null,
                matchmakingType: matchmakingType || 'ELO',
                matchFrequency: matchFrequency || 'FLEXIBLE',
                matchTimeStart: matchTimeStart || null,
                matchTimeEnd: matchTimeEnd || null,
                dayTrip: dayTrip === true,
                minPlayers: minPlayers ? parseInt(minPlayers) : 2,
                setsPerMatch: setsPerMatch ? parseInt(setsPerMatch) : null,
                // true/false/null (serbest) istemciden geldiği gibi kaydedilir — sadece hiç
                // gönderilmediyse (undefined) şema varsayılanı (true) devreye girsin diye dokunulmaz.
                ...(advantageScoring !== undefined && { advantageScoring }),
                matchesBeforePlayoff: matchesBeforePlayoff ? parseInt(matchesBeforePlayoff) : null,
                playoffQualifiers: playoffQualifiers ? parseInt(playoffQualifiers) : null,
                // Airsoft vb. takım tabanlı dallarda Min/Max Oyuncu yerine kullanılıyor — teamSize
                // varsa ve requiredMaleCount 0..teamSize aralığındaysa kaydedilir, aksi halde yok sayılır.
                teamSize: teamSize ? parseInt(teamSize) : null,
                ...(teamSize && teamRequiredMaleCount !== undefined && teamRequiredMaleCount !== null
                    && Number.isInteger(teamRequiredMaleCount) && teamRequiredMaleCount >= 0 && teamRequiredMaleCount <= parseInt(teamSize)
                    ? { teamRequiredMaleCount: parseInt(teamRequiredMaleCount) } : {}),
                maxPlayers: maxPlayers ? parseInt(maxPlayers) : 32,
                location: location || null,
                city: city || null,
                surface: surface || null,
                isIndoor: isIndoor === true,
                eventDate: eventDate ? new Date(eventDate) : null,
                eventTime: eventTime || null,
                eventEndDate: eventEndDate ? new Date(eventEndDate) : null,
                eventEndTime: eventEndTime || null,
                startDate: startDate ? new Date(startDate) : null,
                startTime: startTime || null,
                endDate: endDate ? new Date(endDate) : null,
                endTime: endTime || null,
                rules: Array.isArray(rules) ? rules : [],
                extraServices: cleanExtraServices,
                creatorId: req.userId,
            },
            include: {
                creator: { select: { id: true, username: true, fullName: true } },
                _count: { select: { participants: { where: { status: 'ACCEPTED' } } } },
            },
        });
        res.status(201).json(tournament);

        // Notify city-alert subscribers for tournaments tab (async, non-blocking)
        const creatorInfo = await prisma.user.findUnique({ where: { id: req.userId }, select: { city: true, username: true } }).catch(() => null);
        // tournament.city can be "İl / İlçe" (district appended) — alerts subscribe by plain province only
        const province = (tournament.city || creatorInfo?.city || '').split('/')[0].trim() || null;
        notifyCitySubscribers({
            subCategory: tournament.subCategory,
            category: tournament.category,
            senderCity: province,
            senderUsername: creatorInfo?.username || '',
            senderId: req.userId,
            itemId: tournament.id,
            tab: 'tournaments',
        });
        notifyActivityAlertSubscribers({
            subCategory: tournament.subCategory,
            category: tournament.category,
            senderCity: province,
            senderUsername: creatorInfo?.username || '',
            senderId: req.userId,
            itemId: tournament.id,
            tab: 'tournaments',
        });
    } catch (e) { next(e); }
};

export const getTournaments = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;

        // Auto-delete expired OPEN tournaments (use yesterday as threshold to avoid timezone edge cases)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await prisma.tournament.deleteMany({
            where: {
                status: 'OPEN',
                OR: [
                    { endDate:   { lt: yesterday } },
                    { eventDate: { lt: yesterday } },
                ],
            },
        });

        // Completed tournaments drop off the live list for everyone except their creator
        // and accepted participants, who still need to see final standings/scores.
        const where = {
            OR: [
                { status: { notIn: ['CANCELLED', 'COMPLETED'] } },
                { status: 'COMPLETED', creatorId: req.userId },
                { status: 'COMPLETED', participants: { some: { userId: req.userId, status: 'ACCEPTED' } } },
            ],
        };
        if (category)    where.category    = category;
        if (subCategory) where.subCategory = subCategory;

        const myId = req.userId;
        const tournaments = await prisma.tournament.findMany({
            where,
            include: {
                creator: { select: { id: true, username: true, fullName: true } },
                _count:  { select: { participants: { where: { status: 'ACCEPTED' } } } },
                participants: { where: { userId: myId }, select: { userId: true, status: true } },
                typeVotes: { select: { userId: true, votedType: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(tournaments);
    } catch (e) { next(e); }
};

export const getTournamentById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const myId = req.userId;
        const tournament = await prisma.tournament.findUnique({
            where: { id },
            include: {
                creator: { select: { id: true, username: true, fullName: true } },
                _count:  { select: { participants: { where: { status: 'ACCEPTED' } } } },
                participants: { where: { userId: myId }, select: { userId: true, status: true } },
                typeVotes: { select: { userId: true, votedType: true } },
            },
        });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        res.json(tournament);
    } catch (e) { next(e); }
};

export const voteTournamentType = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { type } = req.body;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.status !== 'POLL') {
            return res.status(400).json({ message: 'Bu turnuvada aktif bir anket yok.' });
        }
        const pollTypes = Array.isArray(tournament.pollTypes) ? tournament.pollTypes : [];
        if (!pollTypes.includes(type)) {
            return res.status(400).json({ message: 'Geçersiz tür seçimi.' });
        }
        await prisma.tournamentTypeVote.upsert({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
            update: { votedType: type },
            create: { tournamentId: id, userId: req.userId, votedType: type },
        });
        const tallies = await prisma.tournamentTypeVote.groupBy({
            by: ['votedType'],
            where: { tournamentId: id },
            _count: { id: true },
        });
        res.json({
            votes: Object.fromEntries(pollTypes.map(tp => [tp, tallies.find(x => x.votedType === tp)?._count.id || 0])),
            myVote: type,
        });
        // Anketi görüntüleyen herkese canlı güncelleme — sabit bir katılımcı listesi
        // olmadığı için (herkes oy verebilir) rivalUpdate ile aynı desende global broadcast.
        broadcast('tournament:vote_updated', { tournamentId: id });
    } catch (e) { next(e); }
};

// Anket kazanan tarafa oy verenleri otomatik başvuru kuyruğuna eklerken kullanılan,
// salt-okunur uygunluk kontrolü — joinTournament'daki aynı kurallar (derecelendirme
// anketi, min. maç sayısı, ban, rating aralığı), ama ban sayacını AZALTMAZ (bu sadece
// pasif bir arkaplan kontrolüdür, kullanıcının aktif bir katılım denemesi değil).
export async function checkPollAutoJoinEligibility(tournament, userId) {
    const [interest, userRec] = await Promise.all([
        prisma.userInterest.findUnique({
            where: { userId_category_subCategory: { userId, category: tournament.category, subCategory: tournament.subCategory } },
            select: { assessmentCompleted: true, wins: true, losses: true, skillRating: true },
        }),
        prisma.user.findUnique({ where: { id: userId }, select: { tournamentBanRemaining: true, gender: true } }),
    ]);
    if (!interest?.assessmentCompleted) {
        return { ok: false, message: 'Derecelendirme anketini tamamlamadığınız için otomatik başvurunuz oluşturulamadı.' };
    }
    if (TENNIS_PADEL_SUBCATEGORIES.includes(tournament.subCategory) && (interest.wins + interest.losses) < MIN_MATCHES_FOR_TOURNAMENT) {
        return { ok: false, message: `Bu spor dalında en az ${MIN_MATCHES_FOR_TOURNAMENT} maç yapmadığınız için otomatik başvurunuz oluşturulamadı.` };
    }
    if (userRec?.tournamentBanRemaining > 0) {
        return { ok: false, message: 'Geç iptal cezası nedeniyle şu anda turnuvalara katılamadığınız için otomatik başvurunuz oluşturulamadı.' };
    }
    const userRating = interest?.skillRating ?? 0;
    // Cinsiyete göre ayrı derece aralığı seçiliyse (ör. erkek 3-4, kadın 4-5) o aralık kullanılır;
    // cinsiyeti belirtilmemiş/OTHER olan kullanıcılar için derece kısıtlaması uygulanmaz.
    let effMinRating = tournament.minRating, effMaxRating = tournament.maxRating;
    if (tournament.ratingGenderSplit) {
        if (userRec?.gender === 'MALE') { effMinRating = tournament.minRatingMale; effMaxRating = tournament.maxRatingMale; }
        else if (userRec?.gender === 'FEMALE') { effMinRating = tournament.minRatingFemale; effMaxRating = tournament.maxRatingFemale; }
        else { effMinRating = null; effMaxRating = null; }
    }
    if (effMinRating != null && userRating < effMinRating) {
        return { ok: false, message: `Bu turnuva en az ${effMinRating}★ derece gerektirdiği için otomatik başvurunuz oluşturulamadı.` };
    }
    if (effMaxRating != null && userRating > effMaxRating) {
        return { ok: false, message: `Bu turnuva en fazla ${effMaxRating}★ dereceli oyuncular için olduğundan otomatik başvurunuz oluşturulamadı.` };
    }
    return { ok: true };
}

export const joinTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { note, partnerId } = req.body;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        if (partnerId) {
            if (tournament.type !== '2' && tournament.type !== '4') return res.status(400).json({ message: 'Partner seçimi sadece Çiftler Rekabetçi ve Çiftler Antrenman turnuvalarda mümkün' });
            if (partnerId === req.userId) return res.status(400).json({ message: 'Kendinizi partner olarak seçemezsiniz' });
            const partnerInterest = await prisma.userInterest.findUnique({
                where: { userId_category_subCategory: { userId: partnerId, category: tournament.category, subCategory: tournament.subCategory } },
                select: { assessmentCompleted: true, wins: true, losses: true },
            });
            if (!partnerInterest?.assessmentCompleted) {
                return res.status(400).json({ message: 'Seçtiğiniz partner bu spor dalında henüz derecelendirme anketini tamamlamamış' });
            }
            if (TENNIS_PADEL_SUBCATEGORIES.includes(tournament.subCategory) &&
                (partnerInterest.wins + partnerInterest.losses) < MIN_MATCHES_FOR_TOURNAMENT) {
                return res.status(400).json({ message: `Seçtiğiniz partner bu spor dalında henüz en az ${MIN_MATCHES_FOR_TOURNAMENT} maç yapmamış` });
            }
        }

        const myInterest = await prisma.userInterest.findUnique({
            where: { userId_category_subCategory: { userId: req.userId, category: tournament.category, subCategory: tournament.subCategory } },
            select: { assessmentCompleted: true, wins: true, losses: true },
        });
        if (!myInterest?.assessmentCompleted) {
            return res.status(403).json({ message: 'Bu spor dalında maçlara katılabilmek için önce derecelendirme anketini tamamlamanız gerekiyor.' });
        }
        if (TENNIS_PADEL_SUBCATEGORIES.includes(tournament.subCategory) &&
            (myInterest.wins + myInterest.losses) < MIN_MATCHES_FOR_TOURNAMENT) {
            return res.status(403).json({ message: `Bu turnuvaya katılabilmek için bu spor dalında uygulama üzerinden en az ${MIN_MATCHES_FOR_TOURNAMENT} maç yapmış olmanız gerekiyor.` });
        }

        if (!['OPEN', 'IN_PROGRESS'].includes(tournament.status)) {
            return res.status(400).json({ message: 'Bu turnuvaya katılım mümkün değil' });
        }
        if (tournament.endDate) {
            const regEnd = new Date(tournament.endDate);
            if (tournament.endTime) {
                const [h, m] = tournament.endTime.split(':').map(Number);
                regEnd.setUTCHours(h, m, 0, 0);
                regEnd.setTime(regEnd.getTime() - 3 * 60 * 60 * 1000); // Turkey UTC+3
            }
            if (regEnd.getTime() <= Date.now()) {
                return res.status(400).json({ message: 'Son başvuru tarihi ve saati geçtiği için bu turnuvaya katılım isteği gönderilemez' });
            }
        }
        if (tournament.status === 'IN_PROGRESS') {
            // Allow join only until the event actually starts
            const eventStart = tournament.eventDate ? new Date(tournament.eventDate) : null;
            if (eventStart && tournament.eventTime) {
                const [h, m] = tournament.eventTime.split(':').map(Number);
                eventStart.setUTCHours(h, m, 0, 0);
                eventStart.setTime(eventStart.getTime() - 3 * 60 * 60 * 1000); // Turkey UTC+3
            }
            if (eventStart && eventStart.getTime() <= Date.now()) {
                return res.status(400).json({ message: 'Etkinlik başlamıştır, katılım süresi dolmuştur' });
            }
        }

        // Check tournament ban + rating
        const [userBan, userInterest] = await Promise.all([
            prisma.user.findUnique({ where: { id: req.userId }, select: { tournamentBanRemaining: true, gender: true } }),
            prisma.userInterest.findUnique({
                where: { userId_category_subCategory: { userId: req.userId, category: tournament.category, subCategory: tournament.subCategory } },
                select: { skillRating: true },
            }),
        ]);
        if (userBan?.tournamentBanRemaining > 0) {
            await prisma.user.update({ where: { id: req.userId }, data: { tournamentBanRemaining: { decrement: 1 } } });
            return res.status(403).json({ message: `Geç iptal cezası nedeniyle ${userBan.tournamentBanRemaining} turnuvaya daha katılamazsınız.` });
        }

        // Check rating limits — cinsiyete göre ayrı aralık seçiliyse (ör. erkek 3-4, kadın 4-5)
        // katılımcının cinsiyetine göre uygun aralık kullanılır; cinsiyeti belirtilmemiş/OTHER
        // olan kullanıcılar için derece kısıtlaması uygulanmaz.
        const userRating = userInterest?.skillRating ?? 0;
        let effMinRating = tournament.minRating, effMaxRating = tournament.maxRating;
        if (tournament.ratingGenderSplit) {
            if (userBan?.gender === 'MALE') { effMinRating = tournament.minRatingMale; effMaxRating = tournament.maxRatingMale; }
            else if (userBan?.gender === 'FEMALE') { effMinRating = tournament.minRatingFemale; effMaxRating = tournament.maxRatingFemale; }
            else { effMinRating = null; effMaxRating = null; }
        }
        if (effMinRating !== null && effMinRating !== undefined && userRating < effMinRating) {
            return res.status(403).json({ message: `Bu turnuvaya katılmak için en az ${effMinRating}★ dereceniz olması gerekiyor. Mevcut dereceniz: ${userRating.toFixed(2)}★` });
        }
        if (effMaxRating !== null && effMaxRating !== undefined && userRating > effMaxRating) {
            return res.status(403).json({ message: `Bu turnuva en fazla ${effMaxRating}★ dereceli oyuncular içindir. Mevcut dereceniz: ${userRating.toFixed(2)}★` });
        }

        const existing = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });
        if (existing) return res.status(400).json({ message: 'You already sent a join request' });

        const participant = await prisma.tournamentParticipant.create({
            data: { tournamentId: id, userId: req.userId, partnerId: partnerId || null, note, status: "PENDING", acceptedAt: null },
            include: {
                user: {
                    select: {
                        id: true, username: true, fullName: true, avatar: true,
                        interests: {
                            where: { category: tournament.category, subCategory: tournament.subCategory },
                            select: { skillRating: true, level: true, assessmentCompleted: true },
                        },
                    },
                },
            },
        });

        emitToUser(tournament.creatorId, 'tournament:join_requested', { tournamentId: id, participant });
        createNotification(
            tournament.creatorId,
            'TOURNAMENT_JOIN_REQUEST',
            '📬 Katılım İsteği',
            `${participant.user?.fullName || participant.user?.username} "${tournament.name}" turnuvasına katılmak istiyor.`,
            { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
        ).catch(() => {});

        if (partnerId) {
            // Partner zaten karşılıktan başvurduysa (mutual), ikisine de eşleştiklerini bildir
            const partnerParticipant = await prisma.tournamentParticipant.findUnique({
                where: { tournamentId_userId: { tournamentId: id, userId: partnerId } },
            });
            const mutual = partnerParticipant?.partnerId === req.userId;
            createNotification(
                partnerId,
                'TOURNAMENT_JOIN',
                mutual ? '🤝 Çift Eşleşmesi Tamamlandı' : '🤝 Çift Daveti',
                mutual
                    ? `"${tournament.name}" turnuvasında çift olarak eşleştiniz, organizatör onayı bekleniyor.`
                    : `${participant.user?.fullName || participant.user?.username} sizi "${tournament.name}" turnuvasında çift partneri olarak seçti. Aynı turnuvaya onu partner göstererek başvurursanız çift olarak eşleşirsiniz.`,
                { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
        }

        res.status(201).json(participant);
    } catch (e) { next(e); }
};

// Çiftler Rekabetçi: zaten başvurmuş (PENDING/ACCEPTED) bir oyuncunun partner seçimini
// son başvuru saatine kadar değiştirmesini sağlar — davet gönderme, daveti kabul etme
// (karşılıklı partnerId aynı kişiyi gösterince eşleşme tamamlanır) ve bireysele dönme
// (partnerId: null) hepsi bu tek endpoint üzerinden yürür.
export const setTournamentPartner = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { partnerId } = req.body;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.type !== '2' && tournament.type !== '4') return res.status(400).json({ message: 'Partner seçimi sadece Çiftler Rekabetçi ve Çiftler Antrenman turnuvalarda mümkün' });

        if (tournament.endDate) {
            const regEnd = new Date(tournament.endDate);
            if (tournament.endTime) {
                const [h, m] = tournament.endTime.split(':').map(Number);
                regEnd.setUTCHours(h, m, 0, 0);
                regEnd.setTime(regEnd.getTime() - 3 * 60 * 60 * 1000); // Turkey UTC+3
            }
            if (regEnd.getTime() <= Date.now()) {
                return res.status(400).json({ message: 'Son başvuru tarihi ve saati geçtiği için partner değişikliği yapılamaz' });
            }
        }

        const me = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });
        if (!me) return res.status(404).json({ message: 'Bu turnuvaya başvurunuz bulunamadı' });
        if (!['PENDING', 'ACCEPTED'].includes(me.status)) return res.status(400).json({ message: 'Başvurunuz aktif değil' });

        if (partnerId) {
            if (partnerId === req.userId) return res.status(400).json({ message: 'Kendinizi partner olarak seçemezsiniz' });
            const partner = await prisma.tournamentParticipant.findUnique({
                where: { tournamentId_userId: { tournamentId: id, userId: partnerId } },
            });
            if (!partner || !['PENDING', 'ACCEPTED'].includes(partner.status)) {
                return res.status(404).json({ message: 'Seçtiğiniz oyuncu bu turnuvada bulunamadı' });
            }
            const partnerInterest = await prisma.userInterest.findUnique({
                where: { userId_category_subCategory: { userId: partnerId, category: tournament.category, subCategory: tournament.subCategory } },
                select: { assessmentCompleted: true },
            });
            if (!partnerInterest?.assessmentCompleted) {
                return res.status(400).json({ message: 'Seçtiğiniz partner bu spor dalında henüz derecelendirme anketini tamamlamamış' });
            }
        }

        // Önceden karşılıklı eşleşmiş olduğum partnerimi değiştiriyorsam/bırakıyorsam,
        // onun tarafındaki partnerId'yi de temizle — eşleşme tek taraflı yarım kalmasın.
        if (me.partnerId && me.partnerId !== partnerId) {
            const prevPartner = await prisma.tournamentParticipant.findUnique({
                where: { tournamentId_userId: { tournamentId: id, userId: me.partnerId } },
            });
            if (prevPartner?.partnerId === req.userId) {
                await prisma.tournamentParticipant.update({ where: { id: prevPartner.id }, data: { partnerId: null } });
                createNotification(
                    prevPartner.userId, 'TOURNAMENT_JOIN', '💔 Çift Eşleşmesi Bozuldu',
                    `"${tournament.name}" turnuvasındaki çift eşleşmeniz sonlandırıldı, bireysel listeye döndünüz.`,
                    { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
                ).catch(() => {});
            }
        }

        const updated = await prisma.tournamentParticipant.update({
            where: { id: me.id },
            data: { partnerId: partnerId || null },
            include: {
                user: {
                    select: {
                        id: true, username: true, fullName: true, avatar: true,
                        interests: {
                            where: { category: tournament.category, subCategory: tournament.subCategory },
                            select: { skillRating: true, level: true, assessmentCompleted: true },
                        },
                    },
                },
            },
        });

        if (partnerId) {
            const partnerRow = await prisma.tournamentParticipant.findUnique({
                where: { tournamentId_userId: { tournamentId: id, userId: partnerId } },
            });
            const mutual = partnerRow?.partnerId === req.userId;
            createNotification(
                partnerId, 'TOURNAMENT_JOIN', mutual ? '🤝 Çift Eşleşmesi Tamamlandı' : '🤝 Çift Daveti',
                mutual
                    ? `"${tournament.name}" turnuvasında çift olarak eşleştiniz.`
                    : `${updated.user?.fullName || updated.user?.username} sizi "${tournament.name}" turnuvasında çift partneri olarak seçti. Onu partner göstererek seçerseniz çift olarak eşleşirsiniz.`,
                { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
            emitToUser(partnerId, 'tournament:partner_request', { tournamentId: id, participant: updated, mutual });
        }

        res.json(updated);
    } catch (e) { next(e); }
};

export const getJoinRequests = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        // Çiftler Rekabetçi / Çiftler Antrenman: katılımcılar da başvuru listesini ve eşleşen takımları görebilsin
        if (tournament.creatorId !== req.userId && tournament.type !== '2' && tournament.type !== '4') {
            return res.status(403).json({ message: 'Not your tournament' });
        }

        const requests = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id },
            include: {
                user: {
                    select: {
                        id: true, username: true, fullName: true, avatar: true,
                        interests: {
                            where: { category: tournament.category, subCategory: tournament.subCategory },
                            select: { skillRating: true, level: true, assessmentCompleted: true },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        // Sort: ACCEPTED (by acceptedAt asc) first, then PENDING (by createdAt asc), then others
        const order = { ACCEPTED: 0, PENDING: 1, REJECTED: 2 };
        requests.sort((a, b) => {
            const oa = order[a.status] ?? 3, ob = order[b.status] ?? 3;
            if (oa !== ob) return oa - ob;
            if (a.status === 'ACCEPTED') {
                return new Date(a.acceptedAt || a.createdAt) - new Date(b.acceptedAt || b.createdAt);
            }
            return new Date(a.createdAt) - new Date(b.createdAt);
        });
        res.json(requests);
    } catch (e) { next(e); }
};

export const getParticipants = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        const participants = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id, status: 'ACCEPTED' },
            include: {
                user: {
                    select: {
                        id: true, username: true, fullName: true, avatar: true,
                        interests: {
                            where: { category: tournament.category, subCategory: tournament.subCategory },
                            select: { skillRating: true, level: true, assessmentCompleted: true },
                        },
                    },
                },
            },
            orderBy: [{ acceptedAt: 'asc' }, { createdAt: 'asc' }],
        });
        res.json(participants);
    } catch (e) { next(e); }
};

export const updateJoinRequest = async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        const { status, reason } = req.body; // ACCEPTED | REJECTED

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not your tournament' });

        const updated = await prisma.tournamentParticipant.update({
            where: { tournamentId_userId: { tournamentId: id, userId } },
            data: { status, ...(status === 'ACCEPTED' && { acceptedAt: new Date() }) },
            include: { user: { select: { id: true, username: true, fullName: true, avatar: true } } },
        });

        res.json(updated);

        // Bildirimler yanıtı bekletmesin — arka planda gönderilir.
        if (status === 'ACCEPTED') {
            prisma.tournamentParticipant.findMany({
                where: { tournamentId: id, status: 'ACCEPTED' },
                select: { userId: true },
            }).then(accepted => {
                const payload = { tournamentId: id, participant: updated };
                accepted.forEach(p => emitToUser(p.userId, 'tournament:participant_accepted', payload));
            }).catch(() => {});
        } else if (status === 'REJECTED') {
            const body = reason ? `"${tournament.name}" turnuvasına başvurunuz reddedildi. Neden: ${reason}` : `"${tournament.name}" turnuvasına başvurunuz reddedildi.`;
            createNotification(userId, 'TOURNAMENT_REJECT', '❌ Başvurunuz Reddedildi', body, { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory }).catch(() => {});
        }
    } catch (e) { next(e); }
};

export const cancelJoin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        const existing = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });
        if (!existing) return res.status(404).json({ message: 'Not registered' });

        // Within 24h of event start â†’ send cancel request to creator instead of direct cancel
        const now = new Date();
        const eventStart = tournament.eventDate ? new Date(tournament.eventDate) : null;
        const msUntilEvent = eventStart ? eventStart.getTime() - now.getTime() : Infinity;
        const within24h = msUntilEvent > 0 && msUntilEvent < 24 * 60 * 60 * 1000;

        if (within24h && existing.status === 'ACCEPTED') {
            // Track late cancellation count and apply penalty if >= 4
            const updatedUser = await prisma.user.update({
                where: { id: req.userId },
                data: { lateCancelCount: { increment: 1 } },
                select: {
                    fullName: true, username: true, lateCancelCount: true,
                    interests: {
                        where: { category: tournament.category, subCategory: tournament.subCategory },
                        select: { id: true, skillRating: true },
                    },
                },
            });
            const newCount = updatedUser.lateCancelCount;
            let penaltyApplied = false;
            if (newCount >= 4) {
                const interest = updatedUser.interests[0];
                if (interest) {
                    await prisma.userInterest.update({
                        where: { id: interest.id },
                        data: { skillRating: { decrement: 0.5 } },
                    });
                }
                await prisma.user.update({
                    where: { id: req.userId },
                    data: { tournamentBanRemaining: { increment: 5 } },
                });
                penaltyApplied = true;
            }
            await prisma.tournamentParticipant.update({
                where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
                data: { cancelRequested: true, cancelReason: reason || null },
            });
            await createNotification(
                tournament.creatorId,
                'TOURNAMENT_CANCEL_REQUEST',
                "⚠️ İptal Talebi",
                `${updatedUser.fullName || updatedUser.username} "${tournament.name}" turnuvasından ayrılmak istiyor (etkinliğe 24 saat kaldı)`,
                { tournamentId: id, userId: req.userId, category: tournament.category, subCategory: tournament.subCategory },
            );
            // Notify creator's open modal in real-time
            emitToUser(tournament.creatorId, 'tournament:cancel_requested', {
                tournamentId: id,
                userId: req.userId,
                cancelReason: reason || null,
            });
            return res.json({ message: 'Cancellation request sent to creator', cancelRequested: true, lateCancelCount: newCount, penaltyApplied });
        }

        const wasAccepted = existing.status === 'ACCEPTED';
        await prisma.tournamentParticipant.delete({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });

        if (wasAccepted) {
            await _promoteOnCancel(id, tournament);
        }

        emitToUser(tournament.creatorId, 'tournament:join_cancelled', { tournamentId: id, userId: req.userId });

        res.json({ message: 'Registration cancelled' });
    } catch (e) { next(e); }
};

// Helper: promote first PENDING participant to ACCEPTED
async function _promoteNextPending(tournamentId, tournament) {
    const nextUp = await prisma.tournamentParticipant.findFirst({
        where: { tournamentId, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
    });
    if (!nextUp) return;
    await prisma.tournamentParticipant.update({
        where: { tournamentId_userId: { tournamentId, userId: nextUp.userId } },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    const tourn = tournament || await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, category: true, subCategory: true } });
    await createNotification(
        nextUp.userId,
        'TOURNAMENT_JOIN_ACCEPTED',
        "🎉 Turnuvaya Kabul Edildiniz",
        `"${tourn.name}" turnuvasına yedek listesinden kabul edildiniz.`,
        { tournamentId, category: tourn.category, subCategory: tourn.subCategory },
    );
}

// Helper: after an AS-list member cancels, promote the first YEDEK to AS, or PENDINGâ†’ACCEPTED if no YEDEK
async function _promoteOnCancel(tournamentId, tournament) {
    const maxP = tournament.maxPlayers;
    const tourn = tournament || await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!maxP) {
        await _promoteNextPending(tournamentId, tourn);
        return;
    }
    const acceptedNow = await prisma.tournamentParticipant.findMany({
        where: { tournamentId, status: 'ACCEPTED' },
        orderBy: [{ acceptedAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (acceptedNow.length >= maxP) {
        // Person now at index maxP-1 just moved from YEDEK to AS â€” notify them
        const promoted = acceptedNow[maxP - 1];
        await createNotification(
            promoted.userId,
            'TOURNAMENT_JOIN_ACCEPTED',
            "🎉 Ana Listeye Alındınız",
            `"${tourn.name}" turnuvasında yedek listesinden AS LİSTE'ye geçtiniz!`,
            { tournamentId, category: tourn.category, subCategory: tourn.subCategory },
        );
    } else {
        // No YEDEK available â€” promote first PENDING
        await _promoteNextPending(tournamentId, tourn);
    }
}

export const approveCancelRequest = async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        const { approve } = req.body; // true | false

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not authorized' });

        const existing = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId } },
        });
        if (!existing || !existing.cancelRequested) return res.status(404).json({ message: 'No cancel request found' });

        if (approve) {
            // Determine if the cancelled user was in AS position before deletion
            let wasAS = true;
            if (tournament.maxPlayers) {
                const allAccepted = await prisma.tournamentParticipant.findMany({
                    where: { tournamentId: id, status: 'ACCEPTED' },
                    orderBy: [{ acceptedAt: 'asc' }, { createdAt: 'asc' }],
                });
                const idx = allAccepted.findIndex(p => p.userId === userId);
                wasAS = idx !== -1 && idx < tournament.maxPlayers;
            }
            await prisma.tournamentParticipant.delete({
                where: { tournamentId_userId: { tournamentId: id, userId } },
            });
            await createNotification(userId, "TOURNAMENT_CANCEL_APPROVED", "✅ İptal Talebiniz Onaylandı",
                `"${tournament.name}" turnuvasından ayrılma talebiniz onaylandı.`,
                { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory });
            if (wasAS) {
                await _promoteOnCancel(id, tournament);
            }
        } else {
            await prisma.tournamentParticipant.update({
                where: { tournamentId_userId: { tournamentId: id, userId } },
                data: { cancelRequested: false },
            });
            await createNotification(userId, "TOURNAMENT_CANCEL_REJECTED", "❌ İptal Talebiniz Reddedildi",
                `"${tournament.name}" turnuvasından ayrılma talebiniz reddedildi.`,
                { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory });
        }

        res.json({ message: approve ? 'Participant removed' : 'Cancel request rejected' });
    } catch (e) { next(e); }
};

export const removeParticipant = async (req, res, next) => {
    try {
        const { id, userId } = req.params;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: "Tournament not found" });

        const requester = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        if (tournament.creatorId !== req.userId && !requester?.isAdmin) return res.status(403).json({ message: "Not authorized" });

        const existing = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId } },
        });
        if (!existing) return res.status(404).json({ message: "Participant not found" });

        const wasAccepted = existing.status === "ACCEPTED";
        await prisma.tournamentParticipant.delete({
            where: { tournamentId_userId: { tournamentId: id, userId } },
        });

        await createNotification(userId, "TOURNAMENT_REMOVED", "❌ Turnuvadan Çıkarıldınız",
            `"${tournament.name}" turnuvasından çıkarıldınız.`,
            { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory });

        if (wasAccepted) { await _promoteNextPending(id, tournament); }

        res.json({ message: "Participant removed" });
    } catch (e) { next(e); }
};

export const addManualParticipant = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name?.trim()) return res.status(400).json({ message: "İsim zorunludur" });

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: "Tournament not found" });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: "Not your tournament" });

        const participant = await prisma.tournamentParticipant.create({
            data: { tournamentId: id, userId: null, manualName: name.trim(), status: "ACCEPTED", acceptedAt: new Date() },
        });

        res.status(201).json(participant);
    } catch (e) { next(e); }
};

export const removeManualParticipant = async (req, res, next) => {
    try {
        const { id, participantId } = req.params;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: "Tournament not found" });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: "Not authorized" });

        const existing = await prisma.tournamentParticipant.findUnique({ where: { id: participantId } });
        if (!existing || existing.tournamentId !== id) return res.status(404).json({ message: "Participant not found" });

        await prisma.tournamentParticipant.delete({ where: { id: participantId } });

        if (existing.status === "ACCEPTED") { await _promoteNextPending(id, tournament); }

        res.json({ message: "Participant removed" });
    } catch (e) { next(e); }
};

export const requestCancellation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { fullName: true, username: true },
        });

        await createNotification(
            tournament.creatorId,
            'CANCELLATION_REQUEST',
            "⚠️ Geç İptal Talebi",
            `${user.fullName || user.username} "${tournament.name}" turnuvasından ayrılmak istiyor (başlangıca 24 saatten az kaldı).`,
            { tournamentId: id, userId: req.userId, category: tournament.category, subCategory: tournament.subCategory },
        );
        res.json({ message: 'Cancellation request sent to creator' });
    } catch (e) { next(e); }
};

export const updateTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const b = req.body;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not authorized' });

        let cleanExtraServices;
        if (b.extraServices !== undefined) {
            cleanExtraServices = sanitizeExtraServices(b.extraServices);
            if (cleanExtraServices === null) return res.status(400).json({ message: 'Geçersiz ekstra hizmet' });
        }

        const updated = await prisma.tournament.update({
            where: { id },
            data: {
                ...(b.name                !== undefined && { name: b.name }),
                ...(cleanExtraServices    !== undefined && { extraServices: cleanExtraServices }),
                ...(b.description         !== undefined && { description: b.description || null }),
                ...(b.contactPhone        !== undefined && { contactPhone: b.contactPhone || null }),
                ...(b.scope               !== undefined && { scope: b.scope }),
                ...(b.genderType          !== undefined && { genderType: b.genderType }),
                ...(b.location            !== undefined && { location: b.location || null }),
                ...(b.surface             !== undefined && { surface: b.surface || null }),
                ...(b.isIndoor            !== undefined && { isIndoor: !!b.isIndoor }),
                ...(b.isPaid              !== undefined && { isPaid: !!b.isPaid }),
                ...(b.feeType             !== undefined && { feeType: b.feeType || null }),
                ...(b.playerFee           !== undefined && { playerFee: b.playerFee ? parseFloat(b.playerFee) : null }),
                ...(b.paymentMethod       !== undefined && { paymentMethod: b.paymentMethod || null }),
                ...(b.ibanNumber          !== undefined && { ibanNumber: b.ibanNumber || null }),
                ...(b.ibanHolder          !== undefined && { ibanHolder: b.ibanHolder || null }),
                ...(b.prize1              !== undefined && { prize1: b.prize1 || null }),
                ...(b.prize2              !== undefined && { prize2: b.prize2 || null }),
                ...(b.prize3              !== undefined && { prize3: b.prize3 || null }),
                ...(b.surpriseGifts       !== undefined && { surpriseGifts: b.surpriseGifts || null }),
                ...(b.minRating          !== undefined && { minRating: b.minRating !== '' && b.minRating !== null ? parseFloat(b.minRating) : null }),
                ...(b.maxRating          !== undefined && { maxRating: b.maxRating !== '' && b.maxRating !== null ? parseFloat(b.maxRating) : null }),
                ...(b.ratingGenderSplit  !== undefined && { ratingGenderSplit: !!b.ratingGenderSplit }),
                ...(b.minRatingMale      !== undefined && { minRatingMale: b.minRatingMale !== '' && b.minRatingMale !== null ? parseFloat(b.minRatingMale) : null }),
                ...(b.maxRatingMale      !== undefined && { maxRatingMale: b.maxRatingMale !== '' && b.maxRatingMale !== null ? parseFloat(b.maxRatingMale) : null }),
                ...(b.minRatingFemale    !== undefined && { minRatingFemale: b.minRatingFemale !== '' && b.minRatingFemale !== null ? parseFloat(b.minRatingFemale) : null }),
                ...(b.maxRatingFemale    !== undefined && { maxRatingFemale: b.maxRatingFemale !== '' && b.maxRatingFemale !== null ? parseFloat(b.maxRatingFemale) : null }),
                ...(b.matchmakingType    !== undefined && { matchmakingType: b.matchmakingType || null }),
                ...(b.matchFrequency     !== undefined && { matchFrequency: b.matchFrequency || null }),
                ...(b.matchTimeStart     !== undefined && { matchTimeStart: b.matchTimeStart || null }),
                ...(b.matchTimeEnd       !== undefined && { matchTimeEnd: b.matchTimeEnd || null }),
                ...(b.minPlayers          !== undefined && { minPlayers: parseInt(b.minPlayers) }),
                ...(b.maxPlayers          !== undefined && { maxPlayers: parseInt(b.maxPlayers) }),
                ...(b.setsPerMatch        !== undefined && { setsPerMatch: b.setsPerMatch ? parseInt(b.setsPerMatch) : null }),
                ...(b.advantageScoring    !== undefined && { advantageScoring: b.advantageScoring }),
                ...(b.matchesBeforePlayoff !== undefined && { matchesBeforePlayoff: b.matchesBeforePlayoff ? parseInt(b.matchesBeforePlayoff) : null }),
                ...(b.playoffQualifiers   !== undefined && { playoffQualifiers: b.playoffQualifiers ? parseInt(b.playoffQualifiers) : null }),
                ...(b.eventDate    !== undefined && { eventDate:    b.eventDate ? new Date(b.eventDate) : null }),
                ...(b.eventTime    !== undefined && { eventTime:    b.eventTime || null }),
                ...(b.eventEndDate !== undefined && { eventEndDate: b.eventEndDate ? new Date(b.eventEndDate) : null }),
                ...(b.eventEndTime !== undefined && { eventEndTime: b.eventEndTime || null }),
                ...(b.endDate      !== undefined && { endDate:      b.endDate ? new Date(b.endDate) : null }),
                ...(b.endTime      !== undefined && { endTime:      b.endTime || null }),
            },
        });
        res.json(updated);
    } catch (e) { next(e); }
};

export const deleteTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({
            where: { id },
            include: { participants: { where: { status: 'ACCEPTED' }, select: { userId: true } } },
        });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId && !req.isAdmin) return res.status(403).json({ message: 'Not authorized' });
        await prisma.tournament.delete({ where: { id } });
        for (const p of tournament.participants) {
            if (p.userId && p.userId !== req.userId) {
                emitToUser(p.userId, 'tournament:deleted', { tournamentId: id });
            }
        }
        res.json({ message: 'Tournament deleted' });
    } catch (e) { next(e); }
};

export const completeTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { bracketData } = req.body; // full bracket JSON from frontend

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not authorized' });

        // Snapshot current ratings of all accepted participants
        const accepted = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id, status: 'ACCEPTED' },
            include: {
                user: {
                    select: {
                        id: true, username: true, fullName: true,
                        interests: {
                            where: { category: tournament.category, subCategory: tournament.subCategory },
                            select: { totalPoints: true, skillRating: true },
                        },
                    },
                },
            },
        });

        const ratingSnapshot = {};
        for (const p of accepted) {
            if (!p.userId || !p.user) continue;
            const interest = p.user.interests?.[0];
            ratingSnapshot[p.userId] = {
                username: p.user.username,
                fullName: p.user.fullName,
                totalPoints: interest?.totalPoints ?? 0,
                skillRating: interest?.skillRating ?? 0,
            };
        }

        const updated = await prisma.tournament.update({
            where: { id },
            data: {
                status: 'COMPLETED',
                bracketData,
                ratingSnapshot,
                completedAt: new Date(),
                city: tournament.location ? tournament.location.split('/')[0].trim() : null,
            },
        });

        res.json(updated);
    } catch (e) { next(e); }
};

// Shared by the manual "/start" route and the auto-start job. `actorUserId` is the
// creator when started manually (skipped in the notify loop since they already know);
// pass null for the auto-start job so every accepted participant — creator included — gets notified.
// Throws an Error with a `.status` for expected validation failures (caller decides how to surface it).
export async function runStartTournament(tournament, { actorUserId = null } = {}) {
    const { id } = tournament;

    const rawParticipants = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: id, status: 'ACCEPTED' },
        include: {
            user: {
                select: {
                    id: true, username: true, fullName: true, gender: true,
                    interests: {
                        where: { category: tournament.category, subCategory: tournament.subCategory },
                        select: { skillRating: true },
                    },
                },
            },
        },
        orderBy: [{ acceptedAt: 'asc' }, { createdAt: 'asc' }],
    });

    // Main list = first maxPlayers accepted (by acceptance order); waitlist = the rest
    if (!tournament.maxPlayers) {
        throw Object.assign(new Error('Lütfen turnuva başlatmadan önce maksimum oyuncu sayısını (AS kadro) belirleyin.'), { status: 400 });
    }
    const mainList = rawParticipants.slice(0, tournament.maxPlayers);

    const players = mainList.map(p => ({
        id: p.userId || p.id,
        fullName: p.userId ? (p.user?.fullName || null) : p.manualName,
        username: p.userId ? (p.user?.username || null) : p.manualName,
        skillRating: p.userId ? (p.user?.interests?.[0]?.skillRating || 0) : 0,
    }));

    if (players.length < (tournament.minPlayers || 2)) {
        throw Object.assign(new Error(`En az ${tournament.minPlayers || 2} oyuncu gerekli`), { status: 400 });
    }

    const mmType = tournament.matchmakingType || 'ELO';
    const freq   = tournament.matchFrequency  || 'FLEXIBLE';
    const daysPerRound = freq === 'WEEKLY_1' ? 7 : freq === 'WEEKLY_2' ? 4 : null;

    const baseDate = tournamentBaseDate(tournament);

    let matches;
    let excludedFromTeams = [];

    if (tournament.type === '1') {
        // Bireysel Rekabetçi: sadece round 1 oluştur, sonraki turlar dinamik
        matches = eloBasedMatches(players, id, 1);
        const deadline = new Date(baseDate);
        deadline.setDate(deadline.getDate() + 7);
        matches = matches.map(m => ({ ...m, deadline }));
    } else if (tournament.type === '3') {
        // Bireysel Antrenman: kura rastgele çekilir ve TÜM GROUP turları baştan oluşturulur —
        // Bireysel Rekabetçi'nin aksine sonraki turlar dinamik üretilmez, kimin kiminle
        // maç yapacağı play-off'a kadar en baştan bellidir (Rule 2).
        const matchesPerPlayer = tournament.matchesBeforePlayoff || Math.min(players.length - 1, 3);
        matches = randomMatches(players, id, matchesPerPlayer);
        matches = matches.map(m => {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + (m.round || 1) * 7);
            return { ...m, deadline: d };
        });
    } else if (tournament.type === '2') {
        // Çiftler Rekabetçi: önce takımları oluştur (partner eşleşenler + ELO'ya göre
        // otomatik eşleşen bireysel başvurular), sonra takımlar arası sadece round 1
        // oluştur — sonraki turlar Bireysel Rekabetçi gibi dinamik üretilir.
        // NOT: maxPlayers kapasitesine kadar TÜM kabul edilmiş başvuranlar (sadece ilk
        // maxPlayers kişi değil) eşleştirmeye dahil edilir — aksi halde ilk maxPlayers
        // içinde cinsiyet dengesizliği yüzünden eşi bulunamayan biri, yedekte uygun bir
        // eşi olsa bile turnuvaya alınamıyordu (bkz. formTeamsForTournament).
        const { teamsData, excluded } = await formTeamsForTournament(tournament, rawParticipants);
        excludedFromTeams = excluded;
        if (teamsData.length < 2) {
            throw Object.assign(new Error('Çiftler Rekabetçi turnuvası için en az 2 takım (4 oyuncu) gerekli.'), { status: 400 });
        }
        for (const ex of excluded) {
            const body = ex.reason === 'capacity'
                ? `"${tournament.name}" turnuvasında kontenjan dolduğu için bu turda yer alamadınız.`
                : `"${tournament.name}" turnuvasında size eşleşecek bir partner bulunamadığı için bu turda yer alamadınız.`;
            createNotification(
                ex.userId, 'TOURNAMENT_REMOVED', '⚠️ Takım Eşleşmesi Bulunamadı', body,
                { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
        }
        const createdTeams = await prisma.$transaction(teamsData.map(td => prisma.tournamentTeam.create({ data: td })));
        const teamPlayers = createdTeams.map(t => ({
            id: t.id,
            fullName: `${t.player1Name} & ${t.player2Name}`,
            username: `${t.player1Name} & ${t.player2Name}`,
            skillRating: t.avgRating,
        }));
        // Full round-robin: all N-1 rounds pre-generated, sorted by ELO closeness so
        // round 1 always contains the globally closest pairings.
        matches = fullRoundRobinByElo(teamPlayers, id, baseDate);
    } else if (tournament.type === '4') {
        // Çiftler Antrenman: takım oluşturma Çiftler Rekabetçi ile aynı adımları izler
        // (önce karşılıklı partner seçenler eşlenir), ama ELO kullanılmaz — eşi olmayan
        // bireysel başvuranlar rastgele eşleştirilerek takım yapılır. Takımlar arası maçlar
        // da ELO round-robin yerine Bireysel Antrenman gibi kura ile ve TÜM GROUP turları
        // baştan oluşturulur (play-off'a kadar kimin kiminle maç yapacağı bellidir).
        const { teamsData, excluded } = await formTeamsForTournament(tournament, rawParticipants, true);
        excludedFromTeams = excluded;
        if (teamsData.length < 2) {
            throw Object.assign(new Error('Çiftler Antrenman turnuvası için en az 2 takım (4 oyuncu) gerekli.'), { status: 400 });
        }
        for (const ex of excluded) {
            const body = ex.reason === 'capacity'
                ? `"${tournament.name}" turnuvasında kontenjan dolduğu için bu turda yer alamadınız.`
                : `"${tournament.name}" turnuvasında size eşleşecek bir partner bulunamadığı için bu turda yer alamadınız.`;
            createNotification(
                ex.userId, 'TOURNAMENT_REMOVED', '⚠️ Takım Eşleşmesi Bulunamadı', body,
                { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
        }
        const createdTeams = await prisma.$transaction(teamsData.map(td => prisma.tournamentTeam.create({ data: td })));
        const teamPlayers = createdTeams.map(t => ({
            id: t.id,
            fullName: `${t.player1Name} & ${t.player2Name}`,
            username: `${t.player1Name} & ${t.player2Name}`,
            skillRating: t.avgRating,
        }));
        const matchesPerPlayer = tournament.matchesBeforePlayoff || Math.min(teamPlayers.length - 1, 3);
        matches = randomMatches(teamPlayers, id, matchesPerPlayer);
        matches = matches.map(m => {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + (m.round || 1) * 7);
            return { ...m, deadline: d };
        });
    } else {
        // Diğer türler
        const matchesPerPlayer = tournament.matchesBeforePlayoff || Math.min(players.length - 1, 3);
        if (mmType === 'RANDOM') {
            matches = randomMatches(players, id, matchesPerPlayer);
        } else if (mmType === 'SEEDED') {
            matches = seededMatches(players, id, matchesPerPlayer);
        } else {
            matches = eloBasedMatches(players, id, matchesPerPlayer);
        }
        if (daysPerRound) {
            matches = matches.map(m => {
                const d = new Date(baseDate);
                d.setDate(d.getDate() + (m.round || 1) * daysPerRound);
                return { ...m, deadline: d };
            });
        }
    }

    await prisma.$transaction([
        prisma.tournamentMatch.createMany({ data: matches }),
        prisma.tournament.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } }),
    ]);

    // Auto-advance BYEs in round 1
    const byeMatches = await prisma.tournamentMatch.findMany({
        where: { tournamentId: id, status: 'BYE', round: tournament.type === '2' ? 1 : undefined },
    });
    for (const bye of byeMatches) {
        if (bye.phase !== 'PLAYOFF') continue; // RR BYEs don't need bracket advancement
        const slot = bye.matchIndex % 2 === 0 ? 'p1' : 'p2';
        const winnerName = bye.p1Id === bye.winnerId ? bye.p1Name : bye.p2Name;
        await prisma.tournamentMatch.updateMany({
            where: { tournamentId: id, round: bye.round + 1, matchIndex: Math.floor(bye.matchIndex / 2), phase: 'PLAYOFF' },
            data: slot === 'p1' ? { p1Id: bye.winnerId, p1Name: winnerName } : { p2Id: bye.winnerId, p2Name: winnerName },
        });
    }

    // Notify real (non-manual) participants + socket push for instant UI update
    // (takım eşleşmesi bulunamayan oyuncular zaten ayrı bir bildirim aldı, bunu almasınlar).
    // Çiftler Rekabetçi'de yedekten takıma çekilen oyuncular da bildirim almalı, bu yüzden
    // type '2' için mainList değil tüm kabul edilenler (rawParticipants) taranır.
    const excludedIds = new Set(excludedFromTeams.map(ex => ex.userId));
    const notifyList = (tournament.type === '2' || tournament.type === '4') ? rawParticipants : mainList;
    for (const p of notifyList) {
        if (p.userId && p.userId !== actorUserId && !excludedIds.has(p.userId)) {
            emitToUser(p.userId, 'tournament:started', { tournamentId: id });
            await createNotification(
                p.userId, 'TOURNAMENT_STARTED', '🏆 Turnuva Başladı',
                `"${tournament.name}" turnuvası başladı! Eşleşmelerinizi kontrol edin.`,
                { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
            );
        }
    }

    return prisma.tournament.findUnique({
        where: { id },
        include: {
            creator: { select: { id: true, username: true, fullName: true } },
            _count: { select: { participants: { where: { status: 'ACCEPTED' } } } },
        },
    });
}

export const startTournament = async (req, res, next) => {
    try {
        const { id } = req.params;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not authorized' });
        if (tournament.status !== 'OPEN') return res.status(400).json({ message: 'Tournament already started or completed' });

        const updated = await runStartTournament(tournament, { actorUserId: req.userId });
        res.json(updated);
    } catch (e) {
        if (e.status) return res.status(e.status).json({ message: e.message });
        next(e);
    }
};

export const rematchTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({
            where: { id },
            include: {
                participants: {
                    where: { status: 'ACCEPTED' },
                    orderBy: [{ acceptedAt: 'asc' }, { createdAt: 'asc' }],
                    include: {
                        user: {
                            select: {
                                id: true, fullName: true, username: true,
                                interests: {
                                    where: { category: { equals: undefined }, subCategory: { equals: undefined } },
                                    select: { skillRating: true },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Yetkiniz yok' });
        if (tournament.status !== 'IN_PROGRESS') return res.status(400).json({ message: 'Turnuva devam etmekte değil' });
        if (tournament.type === '2' || tournament.type === '3' || tournament.type === '4') return res.status(400).json({ message: 'Eleme turnuvaları yeniden eşleştirilemez' });

        // Fetch participants with correct interest filter
        const rawParticipants = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id, status: 'ACCEPTED' },
            orderBy: [{ acceptedAt: 'asc' }, { createdAt: 'asc' }],
            include: {
                user: {
                    select: {
                        id: true, fullName: true, username: true,
                        interests: {
                            where: { category: tournament.category, subCategory: tournament.subCategory },
                            select: { skillRating: true },
                        },
                    },
                },
            },
        });

        const mainList = tournament.maxPlayers ? rawParticipants.slice(0, tournament.maxPlayers) : rawParticipants;
        const players = mainList.map(p => ({
            id: p.userId || p.id,
            fullName: p.userId ? (p.user?.fullName || null) : p.manualName,
            username: p.userId ? (p.user?.username || null) : p.manualName,
            skillRating: p.userId ? (p.user?.interests?.[0]?.skillRating || 0) : 0,
        }));

        const matchesPerPlayer = tournament.matchesBeforePlayoff || Math.min(players.length - 1, 3);
        const newMatches = eloBasedMatches(players, id, matchesPerPlayer);

        await prisma.$transaction([
            // Delete only incomplete GROUP phase matches (keep COMPLETED ones)
            prisma.tournamentMatch.deleteMany({
                where: { tournamentId: id, phase: 'GROUP', status: { not: 'COMPLETED' } },
            }),
            prisma.tournamentMatch.createMany({ data: newMatches }),
        ]);

        const matches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });
        res.json(matches);
    } catch (e) { next(e); }
};

export const getTournamentMatches = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id }, select: { category: true, subCategory: true } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        const [matches, myTeam, teams] = await Promise.all([
            prisma.tournamentMatch.findMany({
                where: { tournamentId: id },
                orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
            }),
            // Çiftler Rekabetçi: maçlarda p1Id/p2Id takım id'sidir — istemcinin "bu maç bana mı ait"
            // kontrolü yapabilmesi için kendi takım id'sini de döndürüyoruz.
            prisma.tournamentTeam.findFirst({
                where: { tournamentId: id, OR: [{ player1Id: req.userId }, { player2Id: req.userId }] },
            }),
            // Takım üyeleri (id + ad) — güncel bireysel/ortalama puan ayrıca hesaplanır.
            prisma.tournamentTeam.findMany({
                where: { tournamentId: id },
                select: { id: true, player1Id: true, player1Name: true, player2Id: true, player2Name: true },
            }),
        ]);

        // Her oyuncunun GÜNCEL bireysel puanı — takımın sabit avgRating snapshot'ı değil,
        // skor girildikten sonra değişen anlık skillRating'e göre hesaplanır (Bireysel ve
        // Çiftler Rekabetçi'de maç kartlarında her zaman en güncel puanlar görünsün diye).
        const userIds = new Set();
        for (const m of matches) {
            if (m.p1Id) userIds.add(m.p1Id);
            if (m.p2Id) userIds.add(m.p2Id);
        }
        for (const t of teams) { userIds.add(t.player1Id); userIds.add(t.player2Id); }

        const interests = await prisma.userInterest.findMany({
            where: { userId: { in: [...userIds] }, category: tournament.category, subCategory: tournament.subCategory },
            select: { userId: true, skillRating: true },
        });
        const ratingOf = (uid) => interests.find(i => i.userId === uid)?.skillRating ?? null;

        const playerRatings = {};
        for (const uid of userIds) playerRatings[uid] = ratingOf(uid);

        const teamsEnriched = teams.map(t => {
            const r1 = ratingOf(t.player1Id), r2 = ratingOf(t.player2Id);
            return {
                id: t.id,
                player1Id: t.player1Id, player1Name: t.player1Name,
                player2Id: t.player2Id, player2Name: t.player2Name,
                avgRating: (r1 != null && r2 != null) ? (r1 + r2) / 2 : null,
            };
        });

        // Joker turnuva boyunca oyuncu/takım başına 1 kez kullanılabilir — istemci bunu
        // bilerek joker butonunu, oyuncunun ZATEN kullandığı maç dışındaki diğer bekleyen
        // maçlarda göstermeyi bıraksın (useJoker'daki `myParticipants.some(p => p.jokerUsed)`
        // sunucu kontrolüyle aynı kaynak).
        const myUserIds = myTeam ? [myTeam.player1Id, myTeam.player2Id] : [req.userId];
        const myJokerParticipants = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id, userId: { in: myUserIds }, status: 'ACCEPTED' },
            select: { jokerUsed: true },
        });
        const myJokerUsed = myJokerParticipants.some(p => p.jokerUsed);

        res.json({ matches, myTeamId: myTeam?.id || null, teams: teamsEnriched, playerRatings, myJokerUsed });
    } catch (e) { next(e); }
};

/** Shared by score entry (enterTournamentMatchScore) and the deadline auto-draw job
 *  (tournamentDeadlineReminder.js): after a GROUP-phase match resolves (win or
 *  auto-draw), generates the next dynamic round / playoff bracket once the current
 *  round is fully resolved, and auto-completes the tournament once no PENDING
 *  matches remain. `tournament` must include `participants` (status ACCEPTED). */
export async function advanceTournamentAfterMatch(tournament, match, isTeamTournament, isCorrection) {
    const id = tournament.id;

    // Bireysel Rekabetçi (type '1'), Çiftler Rekabetçi (type '2') ve Bireysel Antrenman
    // (type '3'): dinamik tur yönetimi. Sadece ilk skor girişinde — bir düzeltme zaten
    // oluşturulmuş turu tekrar oluşturmasın
    if (!isCorrection && (tournament.type === '1' || tournament.type === '2' || tournament.type === '3' || tournament.type === '4') && match.phase === 'GROUP') {
        const allGroupMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id, phase: 'GROUP' },
        });
        const currentRoundMatches = allGroupMatches.filter(m => m.round === match.round);
        const currentRoundDone = currentRoundMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.status === 'FORFEIT');

        // Tip '1' (dinamik tur üretimi): bir maç joker ile uzatılıp bu turun ORİJİNAL
        // (joker'siz) deadline'ı geçtiyse, tek bir açık maç yüzünden herkesin bir sonraki
        // grup turunu beklemesi saçma — bu turun deadline'ı geçince güncel derecelerle bir
        // sonraki tur kurulur; joker'li maç kendi deadline'ında bağımsız sonuçlanmaya devam
        // eder ("aynı kişiyle iki kez maç yok" kuralı PENDING maçları da "oynanmış eşleşme"
        // sayıp zaten koruyor). Play-off'a geçilen SON tur bu gevşemeden ETKİLENMEZ —
        // aşağıdaki playoff dalı ayrıca gerçek/tam bitişi (currentRoundDone) arar.
        let dynamicRoundDeadlinePassed = false;
        if (!currentRoundDone && tournament.type === '1') {
            const nominalDeadline = new Date(tournamentBaseDate(tournament));
            nominalDeadline.setDate(nominalDeadline.getDate() + match.round * 7);
            dynamicRoundDeadlinePassed = Date.now() >= nominalDeadline.getTime();
        }

        const maxRound = Math.max(...allGroupMatches.map(m => m.round));
        // Joker gevşemesi sayesinde bir sonraki tur ZATEN kurulmuş olabilir (bu maç, o sırada
        // hâlâ PENDING kalan eski bir turun "sarkan" maçıydı — match.round burada maxRound'dan
        // KÜÇÜK olur). Böyle bir durumda bu maçın şimdi tamamlanması yeni bir tur ÜRETMEMELİ,
        // çünkü sonraki tur zaten var; sadece aşağıdaki "hiç PENDING kalmadı mı" (turnuva
        // otomatik tamamlama) kontrolüne düşmesi yeterli.
        if ((currentRoundDone || dynamicRoundDeadlinePassed) && match.round === maxRound) {
            const sideCount = isTeamTournament ? new Set(allGroupMatches.flatMap(m => [m.p1Id, m.p2Id]).filter(Boolean)).size : tournament.participants.length;
            // type '2' ve '3': tüm turlar başta pre-generate edilir (full round-robin /
            // rastgele kura), asla 3'e cap'lenmez ve dinamik tur üretilmez.
            const preGenerated = tournament.type === '2' || tournament.type === '3' || tournament.type === '4';
            const matchesPerPlayer = tournament.type === '2'
                ? sideCount - 1
                : (tournament.matchesBeforePlayoff || Math.min(sideCount - 1, 3));
            const existingPlayoff = await prisma.tournamentMatch.findFirst({
                where: { tournamentId: id, phase: 'PLAYOFF' },
            });
            // type '2'/'3' rounds are pre-generated; only generate dynamically for type '1'
            const nextRoundAlreadyExists = allGroupMatches.some(m => m.round === maxRound + 1);
            // Pre-generated tiplerde play-off'a sadece TÜM GROUP maçları (yalnızca en son
            // tur değil) bitince geçilir — aksi halde henüz oynanmamış turlar varken
            // erken play-off oluşturulabilir.
            const groupPhaseFullyDone = preGenerated
                ? allGroupMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.status === 'FORFEIT')
                : maxRound >= matchesPerPlayer;

            if (!preGenerated && maxRound < matchesPerPlayer && !existingPlayoff && !nextRoundAlreadyExists) {
                // Sonraki GROUP turunu güncel ELO ile oluştur (sadece type '1')
                const playedPairKeys = allGroupMatches
                    .filter(m => m.p1Id && m.p2Id)
                    .map(m => [m.p1Id, m.p2Id].sort().join('|'));
                const nextRoundMatches = await generateNextEloRound(tournament, maxRound + 1, playedPairKeys);
                if (nextRoundMatches.length > 0) {
                    await prisma.tournamentMatch.createMany({ data: nextRoundMatches });
                }
            } else if (currentRoundDone && groupPhaseFullyDone && !existingPlayoff && !nextRoundAlreadyExists) {
                // Play-off'a geçiş joker gevşemesinden ETKİLENMEZ — son tur her zaman tam
                // bitmeyi bekler (currentRoundDone yukarıdaki gevşetilmiş dynamicRoundDeadlinePassed
                // değil, gerçek/tam bitiş).
                // Tüm GROUP turları bitti → playoff oluştur (ELO sıralaması + averaj tiebreaker)
                const players = isTeamTournament
                    ? (await prisma.tournamentTeam.findMany({ where: { tournamentId: id } })).map(t => ({
                        id: t.id, fullName: `${t.player1Name} & ${t.player2Name}`, username: `${t.player1Name} & ${t.player2Name}`, skillRating: 0,
                    }))
                    : tournament.participants.map(p => ({
                        id: p.userId, fullName: p.user.fullName, username: p.user.username, skillRating: 0,
                    }));
                const standings = computeStandings(players, allGroupMatches, tournament.type, id);
                const qualifiers = tournament.playoffQualifiers || 4;

                // Son playoff kontenjanı sınırında gerçek (kura hariç) bir eşitlik varsa,
                // kurayla karar vermek yerine bir tur daha ekleyip (oynamayanları en yakın
                // ELO'lu rakiple eşleştirerek) eşitliğin doğal yoldan bozulmasını bekle.
                const boundaryTied = standings.length > qualifiers &&
                    compareStandingsCore(standings[qualifiers - 1], standings[qualifiers], tournament.type) === 0;

                let extraRoundMatches = [];
                if (boundaryTied) {
                    const playedPairKeys = allGroupMatches
                        .filter(m => m.p1Id && m.p2Id)
                        .map(m => [m.p1Id, m.p2Id].sort().join('|'));
                    extraRoundMatches = await generateNextEloRound(tournament, maxRound + 1, playedPairKeys);
                }

                if (boundaryTied && extraRoundMatches.length > 0) {
                    await prisma.tournamentMatch.createMany({ data: extraRoundMatches });

                    const tiedNames = standings
                        .filter(s => compareStandingsCore(s, standings[qualifiers - 1], tournament.type) === 0)
                        .map(s => s.name).join(', ');
                    const recipients = isTeamTournament
                        ? [...new Set((await prisma.tournamentTeam.findMany({ where: { tournamentId: id } }))
                            .flatMap(t => [t.player1Id, t.player2Id]).filter(Boolean))]
                        : tournament.participants.map(p => p.userId).filter(Boolean);
                    for (const uid of recipients) {
                        createNotification(
                            uid, 'TOURNAMENT_EXTRA_ROUND',
                            '⚖️ Play-off öncesi ek tur eklendi',
                            `${tournament.name}: play-off kontenjanı sınırında puan/averaj/set/oyun oranı tamamen eşit olan oyuncular var (${tiedNames}). Eşitlik bozulana kadar bir tur daha eklendi.`,
                            { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory }
                        ).catch(() => {});
                    }
                } else {
                const topStandings = standings.slice(0, Math.min(qualifiers, standings.length));

                // Play-off eşleşmesi: ELO puanına en yakın oyuncular/takımlar (Rule 2)
                const topPlayers = isTeamTournament
                    ? (await getCurrentTeamRatings(tournament, topStandings.map(s => s.userId))).sort((a, b) => (b.skillRating || 0) - (a.skillRating || 0))
                    : (await (async () => {
                        const topParticipants = await prisma.tournamentParticipant.findMany({
                            where: { tournamentId: id, userId: { in: topStandings.map(s => s.userId) }, status: 'ACCEPTED' },
                            include: {
                                user: {
                                    select: {
                                        id: true, username: true, fullName: true,
                                        interests: {
                                            where: { category: tournament.category, subCategory: tournament.subCategory },
                                            select: { skillRating: true },
                                        },
                                    },
                                },
                            },
                        });
                        return topParticipants.map(p => ({
                            id: p.userId,
                            fullName: p.user?.fullName || null,
                            username: p.user?.username || null,
                            skillRating: p.user?.interests?.[0]?.skillRating || 0,
                        }));
                    })()).sort((a, b) => (b.skillRating || 0) - (a.skillRating || 0));

                if (topPlayers.length >= 2) {
                    // Round 1 (ilk play-off turu, ör. çeyrek final): rakipler kura anında belli
                    // olduğu için "hazır" sayılır — ama deadline hemen verilmez, turnuva sahibine
                    // bu tur için kendi tarihini atayabilmesi adına 3 günlük pencere tanınır
                    // (bkz. assignPlayoffRoundDeadline / autoAssignPlayoffDeadlines cron'u).
                    const readyNow = new Date();
                    const playoffData = singleElimMatches(topPlayers, id, maxRound + 1, 'PLAYOFF')
                        .map(m => m.round === maxRound + 1 ? { ...m, readyAt: readyNow } : m);
                    await prisma.tournamentMatch.createMany({ data: playoffData });

                    const playoffByes = await prisma.tournamentMatch.findMany({
                        where: { tournamentId: id, phase: 'PLAYOFF', status: 'BYE', round: maxRound + 1 },
                    });
                    for (const bye of playoffByes) {
                        const slot = bye.matchIndex % 2 === 0 ? 'p1' : 'p2';
                        const winnerName = bye.p1Id === bye.winnerId ? bye.p1Name : bye.p2Name;
                        await prisma.tournamentMatch.updateMany({
                            where: { tournamentId: id, round: bye.round + 1, matchIndex: Math.floor(bye.matchIndex / 2), phase: 'PLAYOFF' },
                            data: slot === 'p1' ? { p1Id: bye.winnerId, p1Name: winnerName } : { p2Id: bye.winnerId, p2Name: winnerName },
                        });
                        const nextRow = await prisma.tournamentMatch.findFirst({
                            where: { tournamentId: id, round: bye.round + 1, matchIndex: Math.floor(bye.matchIndex / 2), phase: 'PLAYOFF' },
                        });
                        if (nextRow) await markPlayoffMatchReadyDeadline(nextRow.id);
                    }
                }
                }
            }
        }
    }

    // Auto-complete tournament when no PENDING matches remain
    const pendingCount = await prisma.tournamentMatch.count({
        where: { tournamentId: id, status: 'PENDING' },
    });
    if (pendingCount === 0 && tournament.status !== 'COMPLETED') {
        await prisma.tournament.update({
            where: { id },
            data: { status: 'COMPLETED', completedAt: new Date() },
        });

        for (const p of tournament.participants) {
            if (!p.userId) continue;
            createNotification(
                p.userId,
                'TOURNAMENT_COMPLETED',
                '🏆 Turnuva Tamamlandı',
                `"${tournament.name}" turnuvası sona erdi. Katılımınız için teşekkür ederiz!`,
                { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory }
            ).catch(() => {});
        }
    }

    const allMatches = await prisma.tournamentMatch.findMany({
        where: { tournamentId: id },
        orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
    });

    // Real-time: notify all participants so they see the updated matches without refresh
    for (const p of tournament.participants) {
        if (p.userId) {
            emitToUser(p.userId, 'tournament:match_scored', { tournamentId: id, matches: allMatches });
        }
    }

    return allMatches;
}

export const enterTournamentMatchScore = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const { sets, winner } = req.body; // sets=[{p1:6,p2:3},...], winner='p1'|'p2'

        const tournament = await prisma.tournament.findUnique({
            where: { id },
            include: {
                participants: {
                    where: { status: 'ACCEPTED' },
                    include: { user: { select: { id: true, username: true, fullName: true } } },
                },
            },
        });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        // COMPLETED allowed too — creator may still need to correct a score after the
        // tournament auto-completed when its last pending match was scored.
        if (!['IN_PROGRESS', 'COMPLETED'].includes(tournament.status)) return res.status(400).json({ message: 'Tournament not in progress' });

        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Match not found' });

        // Çiftler Rekabetçi (type '2'): p1Id/p2Id bir takım id'sidir, kullanıcı değil —
        // her tarafın 1 veya 2 üye kullanıcı id'sine çözülür.
        const isTeamTournament = tournament.type === '2' || tournament.type === '4';
        let p1Members = [match.p1Id].filter(Boolean);
        let p2Members = [match.p2Id].filter(Boolean);
        if (isTeamTournament) {
            const teams = await prisma.tournamentTeam.findMany({ where: { id: { in: [match.p1Id, match.p2Id].filter(Boolean) } } });
            const t1 = teams.find(t => t.id === match.p1Id);
            const t2 = teams.find(t => t.id === match.p2Id);
            if (t1) p1Members = [t1.player1Id, t1.player2Id];
            if (t2) p2Members = [t2.player1Id, t2.player2Id];
        }

        const isCreator = tournament.creatorId === req.userId;
        const isPlayer = isTeamTournament
            ? (p1Members.includes(req.userId) || p2Members.includes(req.userId))
            : (match.p1Id === req.userId || match.p2Id === req.userId);
        if (!isCreator && !isPlayer) {
            const requester = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
            if (!requester?.isAdmin) return res.status(403).json({ message: 'Not authorized' });
        }

        let p1Sets = 0, p2Sets = 0, p1Games = 0, p2Games = 0;
        for (const s of sets) {
            p1Games += s.p1 || 0; p2Games += s.p2 || 0;
            if ((s.p1 || 0) > (s.p2 || 0)) p1Sets++; else if ((s.p2 || 0) > (s.p1 || 0)) p2Sets++;
        }
        const winnerId = winner === 'p1' ? match.p1Id : match.p2Id;
        const loserId  = winner === 'p1' ? match.p2Id : match.p1Id;
        const isCorrection = match.status === 'COMPLETED';

        // Skor her iki taraf tarafından onaylandıysa kilitlenir — admin/oluşturucu dahil
        // kimse artık düzenleyemez.
        if (isCorrection && match.p1Confirmed && match.p2Confirmed) {
            return res.status(400).json({ message: 'Skor her iki taraf tarafından onaylandı, artık düzenlenemez.' });
        }

        // Skoru giren taraf otomatik onaylanır (kendi tarafı için); diğer taraf ayrıca onaylamalı.
        // Skoru giren ne p1 ne p2 tarafındaysa (sadece oluşturucu/admin olarak giriyorsa), hiçbir
        // taraf otomatik onaylanmaz — ikisi de ayrıca onaylamak zorunda.
        const enteredByP1 = p1Members.includes(req.userId);
        const enteredByP2 = p2Members.includes(req.userId);

        // Test/demo kolaylığı: bir taraf TAMAMEN demo oyunculardan oluşuyorsa (demo_ ön ekli
        // kullanıcı adı), o taraf otomatik onaylanır — demo hesaplara giriş yapıp manuel
        // onaylamaya gerek kalmaz.
        const memberUsers = await prisma.user.findMany({
            where: { id: { in: [...p1Members, ...p2Members] } },
            select: { id: true, username: true },
        });
        const isDemoUser = (uid) => !!memberUsers.find(u => u.id === uid)?.username?.startsWith('demo_');
        const p1AllDemo = p1Members.length > 0 && p1Members.every(isDemoUser);
        const p2AllDemo = p2Members.length > 0 && p2Members.every(isDemoUser);

        // Apply competitive points — same system as rival matches (totalPoints + skillRating 0-5).
        // Çiftler Rekabetçi: aynı delta her iki taraftaki TÜM üyelere ayrı ayrı uygulanır.
        let p1EloDelta = 0, p2EloDelta = 0;
        let p1RatingBefore = null, p1RatingAfter = null, p2RatingBefore = null, p2RatingAfter = null;
        // Çiftler Rekabetçi'de p1RatingBefore/After takım ORTALAMASIdır; her üyenin kendi
        // önceki/sonraki bireysel puanı ayrıca burada saklanır (web/mobil "X puanı → Y puanı"
        // şeklinde her oyuncuyu ayrı ayrı gösterebilsin diye). Bireysel Rekabetçi'de tek elemanlı dizi.
        let p1MemberRatings = [], p2MemberRatings = [];
        // If match was already scored, reverse previous ELO before re-applying.
        // Bireysel before/after kayıtlıysa (p1MemberRatings/p2MemberRatings) onlar kullanılır —
        // takım ortalamasına göre geri alırsak, farklı başlangıç puanına sahip iki üye yanlışlıkla
        // birbirine eşitlenirdi.
        if (match.status === "COMPLETED" && match.score && match.p1Id && match.p2Id) {
            const prev = match.score;
            if (prev.p1EloDelta !== 0 || prev.p2EloDelta !== 0) {
                const prevMemberBefore = (uid) => {
                    const entry = [...(prev.p1MemberRatings || []), ...(prev.p2MemberRatings || [])].find(m => m.userId === uid);
                    return entry?.before;
                };
                const prevInterests = await prisma.userInterest.findMany({
                    where: { userId: { in: [...p1Members, ...p2Members] }, category: tournament.category, subCategory: tournament.subCategory },
                });
                for (const uid of p1Members) {
                    const ir = prevInterests.find(i => i.userId === uid);
                    if (!ir) continue;
                    await prisma.userInterest.update({
                        where: { id: ir.id },
                        data: {
                            totalPoints: Math.max(0, ir.totalPoints - prev.p1EloDelta),
                            wins:   { decrement: prev.p1EloDelta > 0 ? 1 : 0 },
                            losses: { decrement: prev.p1EloDelta < 0 ? 1 : 0 },
                            skillRating: prevMemberBefore(uid) ?? prev.p1RatingBefore ?? ir.skillRating,
                        },
                    });
                }
                for (const uid of p2Members) {
                    const ir = prevInterests.find(i => i.userId === uid);
                    if (!ir) continue;
                    await prisma.userInterest.update({
                        where: { id: ir.id },
                        data: {
                            totalPoints: Math.max(0, ir.totalPoints - prev.p2EloDelta),
                            wins:   { decrement: prev.p2EloDelta > 0 ? 1 : 0 },
                            losses: { decrement: prev.p2EloDelta < 0 ? 1 : 0 },
                            skillRating: prevMemberBefore(uid) ?? prev.p2RatingBefore ?? ir.skillRating,
                        },
                    });
                }
            }
        }

        if (p1Members.length > 0 && p2Members.length > 0) {
            const winnerMembers = winner === 'p1' ? p1Members : p2Members;
            const loserMembers  = winner === 'p1' ? p2Members : p1Members;
            const allPlayerIds = [...p1Members, ...p2Members];
            const existing = await prisma.userInterest.findMany({
                where: { userId: { in: allPlayerIds }, category: tournament.category, subCategory: tournament.subCategory },
            });
            const existingIds = new Set(existing.map(i => i.userId));
            const missing = allPlayerIds.filter(uid => !existingIds.has(uid));
            const created = missing.length > 0
                ? await Promise.all(missing.map(userId =>
                    prisma.userInterest.create({
                        data: { userId, category: tournament.category, subCategory: tournament.subCategory, totalPoints: 0, wins: 0, losses: 0, skillRating: 0 },
                    })
                ))
                : [];
            const interests = [...existing, ...created];
            const avgRating = (uids) => uids.reduce((sum, uid) => sum + (interests.find(i => i.userId === uid)?.skillRating || 0), 0) / uids.length;
            const wAvg = avgRating(winnerMembers);
            const lAvg = avgRating(loserMembers);
            // Taraflardan biri bu kategoride hiç oynamamışsa (derecesi bilinmiyor),
            // rakibinin puanını bilinmeyen bir seviyeye göre değiştirmek anlamsız —
            // hiçbir tarafın puanı artmaz/azalmaz.
            if (missing.length === 0) {
                const ratingDiff = Math.abs(wAvg - lAvg);
                let winnerGames = 0, totalGames = 0, loserSets = 0;
                for (const s of sets) {
                    const wg = winner === 'p1' ? (s.p1||0) : (s.p2||0);
                    const lg = winner === 'p1' ? (s.p2||0) : (s.p1||0);
                    winnerGames += wg; totalGames += (s.p1||0) + (s.p2||0);
                    if (lg > wg) loserSets++;
                }

                let wStep, lStep, transferWin, transferLose;
                let reassessFlags = [];
                if (TENNIS_PADEL_SUBCATEGORIES.includes(tournament.subCategory)) {
                    // Tenis/Padel: kullanıcının verdiği sabit ELO puan tablosu — takım ortalamasına göre
                    // Kaybeden taraf en az 1 set aldıysa (set skoru 2-1 vb.) → daima rekabetçi
                    const dominant = loserSets === 0 && (totalGames === 0 || (winnerGames / totalGames) > TENNIS_PADEL_DOMINANT_THRESHOLD);
                    const lowerRatedWon = wAvg < lAvg;
                    const { winnerGain, loserLoss } = getTennisPadelEloDelta(ratingDiff, dominant, lowerRatedWon);
                    wStep = winnerGain;
                    lStep = loserLoss;
                    transferWin = parseFloat((wStep * 20).toFixed(3));
                    transferLose = parseFloat((lStep * 20).toFixed(3));

                    // Anket doğruluğu kontrolü: anketten sonraki ilk 3 maçında kendinden ≥1.0
                    // puan yüksek bir rakibe karşı kazanan oyuncu varsa, bu maç ELO'ya sayılmaz.
                    const winnerInterestsForCheck = winnerMembers.map(uid => interests.find(i => i.userId === uid));
                    const loserInterestsForCheck = loserMembers.map(uid => interests.find(i => i.userId === uid));
                    reassessFlags = getReassessmentFlags(winnerInterestsForCheck, loserInterestsForCheck, wAvg, lAvg);
                } else {
                    const dominant = loserSets === 0 && (totalGames === 0 || (winnerGames / totalGames) > 0.65);
                    let transfer;
                    if (ratingDiff >= 2.0)        transfer = dominant ? 7 : 6;
                    else if (ratingDiff >= 1.0)   transfer = dominant ? 5 : 4;
                    else if (ratingDiff >= 0.5)   transfer = dominant ? 4 : 3;
                    else if (ratingDiff >= 0.25)  transfer = dominant ? 3 : 2;
                    else if (ratingDiff >= 0.10)  transfer = dominant ? 2 : 1;
                    else                          transfer = dominant ? 1 : 0.5;

                    const divisor = tournament.type === "1" ? 2 : 1;
                    let ratingStep = parseFloat((transfer * 0.05 / divisor).toFixed(3));

                    // Algoritma 2: ratingDiff'e göre çarpan uygula (kim kazanırsa kazansın)
                    if (ratingDiff < 0.25)       ratingStep = parseFloat((ratingStep * 3/4).toFixed(4));
                    else if (ratingDiff < 0.75)  ratingStep = parseFloat((ratingStep * 1/2).toFixed(4));
                    else if (ratingDiff < 1.5)   ratingStep = parseFloat((ratingStep * 1/4).toFixed(4));
                    // 1.5+ → değişiklik yok

                    // Algoritma 3: düşük ELO'lu kazanırsa kazanan iki kat alır
                    const lowerRatedWon = wAvg < lAvg;
                    wStep = lowerRatedWon ? parseFloat((ratingStep * 2).toFixed(4)) : ratingStep;
                    lStep = ratingStep;
                    transferWin = transfer;
                    transferLose = transfer;
                }

                const skipElo = reassessFlags.length > 0;
                const isTennisPadel = TENNIS_PADEL_SUBCATEGORIES.includes(tournament.subCategory);
                const updates = [];
                const winnerMemberRatings = [];
                const loserMemberRatings = [];
                for (const uid of winnerMembers) {
                    const wi = interests.find(i => i.userId === uid);
                    let wRatingAfter = parseFloat((wi.skillRating + wStep).toFixed(4));
                    if (wi.skillRating < 5 && wRatingAfter >= 5) wRatingAfter = parseFloat((wRatingAfter + 2).toFixed(4));
                    winnerMemberRatings.push({ userId: uid, before: wi.skillRating, after: skipElo ? wi.skillRating : wRatingAfter });
                    updates.push(prisma.userInterest.update({
                        where: { id: wi.id },
                        data: {
                            ...(skipElo ? {} : { totalPoints: wi.totalPoints + transferWin, skillRating: wRatingAfter }),
                            wins: wi.wins + 1,
                            ...(isTennisPadel && { matchesSinceAssessment: (wi.matchesSinceAssessment ?? 0) + 1 }),
                            ...(reassessFlags.some(f => f.id === wi.id) && { assessmentCompleted: false }),
                        },
                    }));
                }
                for (const uid of loserMembers) {
                    const li = interests.find(i => i.userId === uid);
                    const lRatingAfter = Math.max(0, parseFloat((li.skillRating - lStep).toFixed(4)));
                    loserMemberRatings.push({ userId: uid, before: li.skillRating, after: skipElo ? li.skillRating : lRatingAfter });
                    updates.push(prisma.userInterest.update({
                        where: { id: li.id },
                        data: {
                            ...(skipElo ? {} : { totalPoints: Math.max(0, li.totalPoints - transferLose), skillRating: lRatingAfter }),
                            losses: li.losses + 1,
                            ...(isTennisPadel && { matchesSinceAssessment: (li.matchesSinceAssessment ?? 0) + 1 }),
                        },
                    }));
                }
                await Promise.all(updates);
                p1MemberRatings = winner === 'p1' ? winnerMemberRatings : loserMemberRatings;
                p2MemberRatings = winner === 'p2' ? winnerMemberRatings : loserMemberRatings;

                if (skipElo) {
                    for (const flag of reassessFlags) {
                        createNotification(
                            flag.userId, 'ASSESSMENT_RECHECK',
                            '📋 Derecelendirme Anketini Tekrar Doldurun',
                            `${tournament.subCategory} dalında anketten sonraki ilk maçlarınızda dereceniz beklenenden farklı çıktı. Daha doğru bir eşleşme için lütfen derecelendirme anketini tekrar doldurun.`,
                            { category: tournament.category, subCategory: tournament.subCategory }
                        ).catch(() => {});
                    }
                }

                // Ekrana yazılan önce/sonra değerleri de DB'ye yazılan skillRating ile AYNI
                // hassasiyette (4 ondalık) yuvarlanır — aksi halde ör. wAvg+wStep gibi
                // yuvarlanmamış bir toplamdan sonra istemci tarafında "sonra - önce" farkı
                // alınınca kayan nokta artığı yüzünden gerçek değişim (ör. 0.005) "+0.00"
                // gibi görünüyordu, üstelik gerçek puan zaten değişmişti.
                p1RatingBefore = parseFloat((winner === 'p1' ? wAvg : lAvg).toFixed(4));
                p2RatingBefore = parseFloat((winner === 'p2' ? wAvg : lAvg).toFixed(4));
                p1RatingAfter  = skipElo ? p1RatingBefore : parseFloat((winner === 'p1' ? wAvg + wStep : lAvg - lStep).toFixed(4));
                p2RatingAfter  = skipElo ? p2RatingBefore : parseFloat((winner === 'p2' ? wAvg + wStep : lAvg - lStep).toFixed(4));
                p1EloDelta = skipElo ? 0 : (winner === 'p1' ? +transferWin : -transferLose);
                p2EloDelta = skipElo ? 0 : (winner === 'p2' ? +transferWin : -transferLose);
            }
        }

        const score = { sets, winner, p1Sets, p2Sets, p1Games, p2Games, p1EloDelta, p2EloDelta, p1RatingBefore, p1RatingAfter, p2RatingBefore, p2RatingAfter, p1MemberRatings, p2MemberRatings };

        await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: {
                score, status: 'COMPLETED', winnerId,
                scoreEnteredBy: req.userId,
                p1Confirmed: enteredByP1 || p1AllDemo,
                p2Confirmed: enteredByP2 || p2AllDemo,
                scoreSubmittedAt: new Date(),
            },
        });

        // Advance winner through PLAYOFF bracket
        if (match.phase === 'PLAYOFF') {
            const winnerName = winner === 'p1' ? match.p1Name : match.p2Name;
            const slot = match.matchIndex % 2 === 0 ? 'p1' : 'p2';
            const nextMatch = await prisma.tournamentMatch.findFirst({
                where: { tournamentId: id, round: match.round + 1, matchIndex: Math.floor(match.matchIndex / 2), phase: 'PLAYOFF' },
            });
            if (nextMatch) {
                await prisma.tournamentMatch.update({
                    where: { id: nextMatch.id },
                    data: slot === 'p1' ? { p1Id: winnerId, p1Name: winnerName } : { p2Id: winnerId, p2Name: winnerName },
                });
                await markPlayoffMatchReadyDeadline(nextMatch.id);
            }
        }

        const allMatches = await advanceTournamentAfterMatch(tournament, match, isTeamTournament, isCorrection);

        res.json(allMatches);

        // Henüz onaylamamış taraf(lar)a bildirim gönder — skor girildi, onay bekleniyor.
        const unconfirmedTargets = [];
        if (!(enteredByP1 || p1AllDemo)) unconfirmedTargets.push(...p1Members);
        if (!(enteredByP2 || p2AllDemo)) unconfirmedTargets.push(...p2Members);
        const notifyRecipients = [...new Set(unconfirmedTargets)].filter(uid => uid !== req.userId);
        if (notifyRecipients.length > 0) {
            prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } })
                .then(me => {
                    const enteredByName = me?.fullName || me?.username || 'Rakibiniz';
                    for (const uid of notifyRecipients) {
                        createNotification(
                            uid, 'SCORE_SUBMITTED',
                            '📊 Skor girildi, onaylar mısın?',
                            `${enteredByName} ${tournament.subCategory} maçının skorunu girdi. Lütfen onaylayın veya gerekirse düzeltin.`,
                            { tournamentId: id, matchId: match.id, fromUserId: req.userId, category: tournament.category, subCategory: tournament.subCategory }
                        ).catch(() => {});
                    }
                }).catch(() => {});
        }
    } catch (e) { next(e); }
};

/** Skoru girmemiş taraf, kendi tarafından biri (Çiftler'de takım üyesi) olarak skoru
 *  onaylar. İki taraf da onaylayınca skor kilitlenir — bundan sonra admin/oluşturucu
 *  dahil kimse Düzelt ile değiştiremez (enterTournamentMatchScore'daki kilit kontrolü).
 */
export const confirmTournamentMatchScore = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });

        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı.' });
        if (match.status !== 'COMPLETED') return res.status(400).json({ message: 'Bu maç için henüz skor girilmedi.' });

        const isTeamTournament = tournament.type === '2' || tournament.type === '4';
        let p1Members = [match.p1Id].filter(Boolean);
        let p2Members = [match.p2Id].filter(Boolean);
        if (isTeamTournament) {
            const teams = await prisma.tournamentTeam.findMany({ where: { id: { in: [match.p1Id, match.p2Id].filter(Boolean) } } });
            const t1 = teams.find(t => t.id === match.p1Id);
            const t2 = teams.find(t => t.id === match.p2Id);
            if (t1) p1Members = [t1.player1Id, t1.player2Id];
            if (t2) p2Members = [t2.player1Id, t2.player2Id];
        }

        const isP1 = p1Members.includes(req.userId);
        const isP2 = p2Members.includes(req.userId);
        if (!isP1 && !isP2) return res.status(403).json({ message: 'Bu maçta yer almıyorsunuz.' });

        await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: { ...(isP1 && { p1Confirmed: true }), ...(isP2 && { p2Confirmed: true }) },
        });

        const allMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });
        for (const uid of [...p1Members, ...p2Members]) {
            emitToUser(uid, 'tournament:match_scored', { tournamentId: id, matches: allMatches });
        }
        res.json(allMatches);
    } catch (e) { next(e); }
};

/** Joker hakkı kullanımı — Bireysel Rekabetçi (type '1') turnuvalara özgü
 *  - Sadece bu oyuncu: joker tükenir, deadline +7 gün
 *  - Karşılıklı joker: joker tüketilmez, deadline +7 gün (Rule 4)
 */
export const useJoker = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;

        const tournament = await prisma.tournament.findUnique({
            where: { id },
            include: { participants: { where: { status: 'ACCEPTED' }, select: { userId: true } } },
        });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });
        if (!['1', '2', '3', '4'].includes(tournament.type)) {
            return res.status(400).json({ message: 'Joker hakkı sadece Bireysel Rekabetçi, Çiftler Rekabetçi, Bireysel Antrenman ve Çiftler Antrenman turnuvalarda kullanılabilir.' });
        }
        if (tournament.dayTrip) {
            return res.status(400).json({ message: 'Günübirlik turnuvalarda joker hakkı bulunmaz — tüm maçlar aynı gün oynanır.' });
        }

        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı.' });
        if (match.status !== 'PENDING') return res.status(400).json({ message: 'Bu maç zaten tamamlanmış.' });

        // Çiftler Rekabetçi: p1Id/p2Id takım id'sidir — kendi tarafımın üyelerine çözülür.
        const isTeamTournament = tournament.type === '2' || tournament.type === '4';
        let p1Members = [match.p1Id].filter(Boolean);
        let p2Members = [match.p2Id].filter(Boolean);
        if (isTeamTournament) {
            const teams = await prisma.tournamentTeam.findMany({ where: { id: { in: [match.p1Id, match.p2Id].filter(Boolean) } } });
            const t1 = teams.find(t => t.id === match.p1Id);
            const t2 = teams.find(t => t.id === match.p2Id);
            if (t1) p1Members = [t1.player1Id, t1.player2Id];
            if (t2) p2Members = [t2.player1Id, t2.player2Id];
        }

        const isP1 = p1Members.includes(req.userId);
        const isP2 = p2Members.includes(req.userId);
        if (!isP1 && !isP2) return res.status(403).json({ message: 'Bu maçta yer almıyorsunuz.' });

        const myMembers    = isP1 ? p1Members : p2Members;
        const otherMembers = isP1 ? p2Members : p1Members;

        const sideParticipants = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id, userId: { in: [...myMembers, ...otherMembers] }, status: 'ACCEPTED' },
        });
        const myParticipants = sideParticipants.filter(p => myMembers.includes(p.userId));
        const otherParticipants = sideParticipants.filter(p => otherMembers.includes(p.userId));
        if (myParticipants.length === 0) return res.status(404).json({ message: 'Katılımcı bulunamadı.' });

        const otherJokerRequested = isP1 ? match.p2JokerRequested : match.p1JokerRequested;
        const newDeadline = new Date(match.deadline || new Date());
        newDeadline.setDate(newDeadline.getDate() + 7);
        // Play-off (çeyrek/yarı final/final) maçlarında aynı mekanik "maç yarıda kaldı,
        // ek süre" olarak sunulur — grup turundaki "joker" ile birebir aynı hak/limit,
        // sadece kullanıcıya gösterilen metin bağlama göre değişir.
        const isPlayoff = match.phase === 'PLAYOFF';
        const alreadyUsedMsg = isPlayoff
            ? (isTeamTournament ? 'Takımınız ek süre hakkını daha önce kullandı.' : 'Ek süre hakkınızı daha önce kullandınız.')
            : (isTeamTournament ? 'Takımınız joker hakkını daha önce kullandı.' : 'Joker hakkınızı daha önce kullandınız.');

        const emitMatchUpdate = async () => {
            const allMatches = await prisma.tournamentMatch.findMany({
                where: { tournamentId: id },
                orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
            });
            for (const userId of [...p1Members, ...p2Members]) {
                emitToUser(userId, 'tournament:match_scored', { tournamentId: id, matches: allMatches });
            }
            return allMatches;
        };

        if (otherJokerRequested) {
            // Karşılıklı joker: rakip taraf ilk tıkladığında tek kullanım sayılıp deadline +7 uzamış ve
            // kendi hakkı tüketilmişti. Bu tarafın da onaylamasıyla durum "karşılıklı" oluyor:
            // süre tekrar +7 EKLENMEZ (toplam hep +7 kalır) ve iki tarafın da joker hakkı geri verilir/korunur.
            // Onay hakkı kendi başına turnuva boyunca oyuncu/takım başına 1 kez kullanılabilir.
            if (myParticipants.some(p => p.mutualJokerUsed)) {
                return res.status(400).json({ message: `Karşılıklı ${isPlayoff ? 'ek süre' : 'joker'} onay hakkınızı bu turnuvada daha önce kullandınız.` });
            }
            await prisma.$transaction([
                prisma.tournamentMatch.update({
                    where: { id: matchId },
                    data: { p1JokerRequested: false, p2JokerRequested: false },
                }),
                ...myParticipants.map(p => prisma.tournamentParticipant.update({
                    where: { id: p.id },
                    data: { mutualJokerUsed: true },
                })),
                ...otherParticipants.map(p => prisma.tournamentParticipant.update({
                    where: { id: p.id },
                    data: { jokerUsed: false, jokerUsedAt: null },
                })),
            ]);
            await emitMatchUpdate();
            return res.json({ mutual: true, message: `Karşılıklı ${isPlayoff ? 'ek süre' : 'joker'} onaylandı — süre +7 gün (tekrar eklenmedi), iki tarafın da hakkı tükenmedi.`, deadline: match.deadline });
        } else {
            if (myParticipants.some(p => p.jokerUsed)) {
                return res.status(400).json({ message: alreadyUsedMsg });
            }
            // Tek joker/ek süre: +7 gün, hak tükenir (Çiftler Rekabetçi'de takımın HER İKİ üyesi için de tükenir)
            const field = isP1 ? 'p1JokerRequested' : 'p2JokerRequested';
            await prisma.$transaction([
                prisma.tournamentMatch.update({
                    where: { id: matchId },
                    data: { [field]: true, deadline: newDeadline },
                }),
                ...myParticipants.map(p => prisma.tournamentParticipant.update({
                    where: { id: p.id },
                    data: { jokerUsed: true, jokerUsedAt: new Date() },
                })),
            ]);
            await emitMatchUpdate();
            return res.json({ mutual: false, message: `${isPlayoff ? 'Ek süre hakkınız' : 'Joker hakkınız'} kullanıldı — deadline 7 gün uzatıldı.`, deadline: newDeadline });
        }
    } catch (e) { next(e); }
};

// Turnuva grup sohbeti — sadece turnuva sahibi ve AS/yedek olarak onaylanmış (ACCEPTED) katılımcılar
export const getTournamentChat = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id }, select: { creatorId: true } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });

        if (tournament.creatorId !== req.userId) {
            const participant = await prisma.tournamentParticipant.findFirst({
                where: { tournamentId: id, userId: req.userId, status: 'ACCEPTED' },
            });
            if (!participant) return res.status(403).json({ message: 'Bu turnuvanın sohbetine erişiminiz yok.' });
        }

        const messages = await prisma.tournamentMessage.findMany({
            where: { tournamentId: id },
            include: { sender: { select: { id: true, username: true, fullName: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
            take: 200,
        });
        res.json(messages);
    } catch (e) { next(e); }
};

export const sendTournamentChatMessage = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ message: 'Mesaj boş olamaz.' });

        const tournament = await prisma.tournament.findUnique({
            where: { id },
            include: { participants: { where: { status: 'ACCEPTED' }, select: { userId: true } } },
        });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });

        const isCreator = tournament.creatorId === req.userId;
        const isParticipant = tournament.participants.some(p => p.userId === req.userId);
        if (!isCreator && !isParticipant) return res.status(403).json({ message: 'Bu turnuvanın sohbetine erişiminiz yok.' });

        const message = await prisma.tournamentMessage.create({
            data: { tournamentId: id, senderId: req.userId, content: content.trim().slice(0, 1000) },
            include: { sender: { select: { id: true, username: true, fullName: true, avatar: true } } },
        });

        const recipientIds = new Set([tournament.creatorId, ...tournament.participants.map(p => p.userId).filter(Boolean)]);
        recipientIds.delete(req.userId);
        for (const uid of recipientIds) {
            emitToUser(uid, 'tournament:chat_message', { tournamentId: id, message });
        }

        // Bildirim sadece bu turnuva sohbeti için açık olan alıcılara gider (varsayılan kapalı)
        if (recipientIds.size > 0) {
            const optedIn = await prisma.tournamentChatNotify.findMany({
                where: { tournamentId: id, userId: { in: [...recipientIds] }, enabled: true },
                select: { userId: true },
            });
            const senderName = message.sender?.fullName || message.sender?.username || '';
            for (const { userId } of optedIn) {
                createNotification(
                    userId, 'TOURNAMENT_CHAT_MESSAGE',
                    `💬 ${tournament.name}`,
                    `${senderName}: ${message.content}`,
                    { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
                ).catch(() => {});
            }
        }

        res.status(201).json(message);
    } catch (e) { next(e); }
};

// Turnuva sohbeti bildirim tercihi — varsayılan kapalı, kullanıcı kendisi açar/kapatır
export const getChatNotifyPref = async (req, res, next) => {
    try {
        const { id } = req.params;
        const pref = await prisma.tournamentChatNotify.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
            select: { enabled: true },
        });
        res.json({ enabled: pref?.enabled || false });
    } catch (e) { next(e); }
};

export const setChatNotifyPref = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;
        const pref = await prisma.tournamentChatNotify.upsert({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
            update: { enabled: !!enabled },
            create: { tournamentId: id, userId: req.userId, enabled: !!enabled },
        });
        res.json({ enabled: pref.enabled });
    } catch (e) { next(e); }
};

export const getArchivedTournaments = async (req, res, next) => {
    try {
        const { category, subCategory, city, dateFrom, dateTo, participantId } = req.query;
        const myId = req.userId;
        const filterUserId = participantId || null;

        const where = {
            status: 'COMPLETED',
            ...(category    && { category }),
            ...(subCategory && { subCategory }),
            ...(city        && { OR: [
                { city:     { contains: city, mode: 'insensitive' } },
                { location: { contains: city, mode: 'insensitive' } },
            ]}),
            ...(dateFrom && { completedAt: { gte: new Date(dateFrom) } }),
            ...(dateTo   && { completedAt: { lte: new Date(dateTo) } }),
            ...(filterUserId && {
                OR: [
                    { creatorId: filterUserId },
                    { participants: { some: { userId: filterUserId, status: 'ACCEPTED' } } },
                ],
            }),
        };

        const all = await prisma.tournament.findMany({
            where,
            include: {
                creator:      { select: { id: true, username: true, fullName: true } },
                participants: { where: { userId: myId }, select: { userId: true } },
                _count:       { select: { participants: { where: { status: 'ACCEPTED' } } } },
            },
            orderBy: { completedAt: 'desc' },
        });

        // Liste ekranında detaya girmeden de "kaçıncı oldu" göstermek için, filtrelenen
        // kullanıcının (participantId) her turnuvadaki yerleşimini hesaplayıp ekliyoruz.
        const result = filterUserId
            ? await Promise.all(all.map(async (t) => {
                const { placement } = await computeTournamentPlacement(t.id, filterUserId, t.bracketData);
                return { ...t, myPlacement: placement };
            }))
            : all;

        res.json(result);
    } catch (e) { next(e); }
};

export const requestTournamentPermission = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
        const existing = await prisma.tournamentPermissionRequest.findUnique({ where: { userId: req.userId }, select: { status: true } });
        if (existing?.status === 'APPROVED') return res.json({ status: 'APPROVED' });

        await prisma.tournamentPermissionRequest.upsert({
            where: { userId: req.userId },
            create: { userId: req.userId, status: 'PENDING' },
            update: { status: 'PENDING', updatedAt: new Date() },
        });

        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        for (const admin of admins) {
            createNotification(
                admin.id, 'TOURNAMENT_PERMISSION_REQUEST',
                '📋 Turnuva İzin Talebi',
                `${user.username} turnuva oluşturma izni talep etti.`,
                { requestUserId: req.userId, requestUsername: user.username }
            ).catch(() => {});
        }
        res.json({ status: 'PENDING' });
    } catch (e) { next(e); }
};

export const getTournamentPermissionStatus = async (req, res, next) => {
    try {
        const now = new Date();
        const sub = await prisma.businessSubscription.findFirst({
            where: { userId: req.userId, status: 'ACTIVE', endDate: { gt: now } },
            select: { packageType: true, endDate: true },
        });
        res.json({ status: sub ? 'APPROVED' : 'NONE', subscription: sub || null });
    } catch (e) { next(e); }
};

// ─── Turnuva Kort Yönetimi ─────────────────────────────────────────────────────

export const getTournamentCourts = async (req, res, next) => {
    try {
        const { id } = req.params;
        const courts = await prisma.tournamentCourt.findMany({
            where: { tournamentId: id },
            include: { court: true },
            orderBy: { createdAt: 'asc' },
        });
        res.json(courts);
    } catch (e) { next(e); }
};

export const addTournamentCourt = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { courtId } = req.body;

        const tournament = await prisma.tournament.findUnique({ where: { id }, select: { creatorId: true, eventDate: true, eventTime: true, eventEndDate: true, eventEndTime: true, matchTimeStart: true, matchTimeEnd: true } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Yalnızca turnuva sahibi kort ekleyebilir' });

        const court = await prisma.court.findUnique({ where: { id: courtId }, select: { addedBy: true } });
        if (!court) return res.status(404).json({ message: 'Kort bulunamadı' });
        if (court.addedBy !== req.userId) return res.status(403).json({ message: 'Yalnızca kendi kortlarınızı ekleyebilirsiniz' });

        // Kort bloğu için tarih/saat hesapla
        const blockStart = buildDateTime(tournament.eventDate, tournament.matchTimeStart || tournament.eventTime);
        const blockEnd   = buildDateTime(tournament.eventEndDate || tournament.eventDate, tournament.matchTimeEnd || tournament.eventEndTime);

        const [tc] = await prisma.$transaction([
            prisma.tournamentCourt.create({ data: { tournamentId: id, courtId }, include: { court: true } }),
            ...(blockStart && blockEnd ? [prisma.courtBlock.upsert({
                where: { courtId_tournamentId: { courtId, tournamentId: id } },
                create: { courtId, tournamentId: id, startAt: blockStart, endAt: blockEnd },
                update: { startAt: blockStart, endAt: blockEnd },
            })] : []),
        ]);

        res.status(201).json(tc);
    } catch (e) { next(e); }
};

export const removeTournamentCourt = async (req, res, next) => {
    try {
        const { id, courtId } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id }, select: { creatorId: true } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Yalnızca turnuva sahibi kort kaldırabilir' });

        await prisma.$transaction([
            prisma.tournamentCourt.deleteMany({ where: { tournamentId: id, courtId } }),
            prisma.courtBlock.deleteMany({ where: { tournamentId: id, courtId } }),
            prisma.tournamentMatch.updateMany({ where: { tournamentId: id, courtId }, data: { courtId: null } }),
        ]);

        res.json({ message: 'Kort kaldırıldı' });
    } catch (e) { next(e); }
};

export const assignCourtToMatch = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const { courtId } = req.body;

        const tournament = await prisma.tournament.findUnique({ where: { id }, select: { creatorId: true } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Yalnızca turnuva sahibi kort atayabilir' });

        if (courtId) {
            const linked = await prisma.tournamentCourt.findUnique({ where: { tournamentId_courtId: { tournamentId: id, courtId } } });
            if (!linked) return res.status(400).json({ message: 'Bu kort turnuvaya eklenmemiş' });
        }

        const match = await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: { courtId: courtId || null },
            include: { court: { select: { id: true, name: true, address: true } } },
        });

        res.json(match);
    } catch (e) { next(e); }
};

// Turnuva sahibi, play-off turunun (çeyrek final/yarı final/final) rakipleri belli olduktan
// (readyAt damgalandıktan) sonra o tur için kendi tarihini/saatini atayabilir — bu, sistemin
// otomatik verdiği 7 günlük süreyi (bkz. autoAssignPlayoffDeadlines cron'u, readyAt'ten 3 gün
// sonra devreye girer) öne alır/değiştirir. Sadece rakipleri belli, henüz oynanmamış maçlara uygulanır.
export const assignPlayoffRoundDeadline = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { round, deadlineDate, deadlineTime } = req.body;
        if (!round || !deadlineDate) return res.status(400).json({ message: 'Tur ve tarih zorunludur' });

        const tournament = await prisma.tournament.findUnique({ where: { id }, select: { creatorId: true } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Yalnızca turnuva sahibi bu tur için tarih atayabilir' });

        const deadline = buildDateTime(deadlineDate, deadlineTime);
        if (!deadline || deadline.getTime() <= Date.now()) return res.status(400).json({ message: 'Geçmiş veya geçersiz bir tarih seçilemez' });

        const matches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id, phase: 'PLAYOFF', round: parseInt(round, 10), status: 'PENDING', readyAt: { not: null } },
            select: { id: true },
        });
        if (matches.length === 0) return res.status(400).json({ message: 'Bu tur için henüz atanacak maç yok (rakipler belli değil)' });

        await prisma.tournamentMatch.updateMany({
            where: { id: { in: matches.map(m => m.id) } },
            data: { deadline },
        });

        res.json({ ok: true });
    } catch (e) { next(e); }
};

function buildDateTime(date, time) {
    if (!date) return null;
    const d = new Date(date).toISOString().split('T')[0];
    const t = time || '00:00';
    return new Date(`${d}T${t}:00+03:00`);
}
