import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { createNotification } from './notification.controller.js';
import { emitToUser, broadcast } from '../config/socket.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';
import { TENNIS_PADEL_SUBCATEGORIES, TENNIS_PADEL_DOMINANT_THRESHOLD, getTennisPadelEloDelta, getReassessmentFlags, MIN_MATCHES_FOR_TOURNAMENT, interestMatchCount } from '../utils/tennisElo.js';
import { UTR_SUBCATEGORIES, applyUtrRatingForTournamentMatch, revertUtrMatchRecords, getDisplayRating, isDoublesFormat, buildPenaltyUpdate } from '../utils/utrRating.js';
import { computeTournamentPlacement } from './achievement.controller.js';
import { sanitizeExtraServices } from '../utils/extraServices.js';
import { ACTIVE_ENGINE_TYPES, resolveFormatOnCreate, isTeamEngineType } from '../utils/tournamentFormats.js';
import { startDefiLadder, isDefi, defiSettingsOf } from './defiLeague.controller.js';
import { DEFI_SUBS } from '../utils/defiLadder.js';
import { isRacketSetSport, normalizeRacketSets } from '../utils/racketScore.js';
import { ensureTournamentChatTables, isMissingChatTable } from '../utils/ensureTournamentChatTables.js';
import { notifyTournamentMatchPairings } from '../utils/tournamentMatchNotify.js';
import {
    computeMatchScheduleSuggested,
    getMatchAvailWindow,
    constrainSlotsToWindow,
    isYmdInWindow,
} from '../utils/tournamentAvailabilityMatch.js';
import {
    swissRoundCount,
    americanoRoundCount,
    pairSwissRound,
    swissMatchesFromPairing,
    buildWinnersBracket,
    winnersNextSlot,
    losersDropTarget,
    losersNextSlot,
    pairAmericanoRound,
    applyByeToStandings,
} from '../utils/tournamentEngines.js';

/** Bu spor dalındaki görünen ad: UserInterest.alias varsa o, yoksa fullName/username. */
function sportDisplayName(userOrPlayer, interest) {
    const alias = interest?.alias ?? userOrPlayer?.alias ?? null;
    if (alias) return alias;
    return userOrPlayer?.fullName || userOrPlayer?.username || 'Oyuncu';
}

function rosterHasUser(arr, userId) {
    return (Array.isArray(arr) ? arr : []).some(p => p?.id === userId);
}

/**
 * Turnuva min-maç kapısı: wins/losses yalnız sonuçlu rekabetçi maçlarda artar.
 * Arşivde görünen beraberlik / pratik / UTR kayıtları da "uygulama üzerinden maç" sayılır.
 */
async function countAppMatchesForTournament(userId, category, subCategory, interest) {
    const fromInterest = interestMatchCount(interest);
    if (fromInterest >= MIN_MATCHES_FOR_TOURNAMENT) return fromInterest;

    const [utrRecords, rivals] = await Promise.all([
        prisma.ratingMatchRecord.count({
            where: { userId, subCategory },
        }).catch(() => 0),
        prisma.activityRequest.findMany({
            where: {
                category,
                subCategory,
                status: 'COMPLETED',
            },
            select: {
                senderId: true,
                receiverId: true,
                participants: true,
                senderTeam: true,
                unassignedPlayers: true,
                substitutePlayers: true,
            },
            orderBy: { completedAt: 'desc' },
            take: 400,
        }).catch(() => []),
    ]);

    let rivalPlayed = 0;
    for (const r of rivals) {
        if (
            r.senderId === userId
            || r.receiverId === userId
            || rosterHasUser(r.participants, userId)
            || rosterHasUser(r.senderTeam, userId)
            || rosterHasUser(r.unassignedPlayers, userId)
            || rosterHasUser(r.substitutePlayers, userId)
        ) {
            rivalPlayed += 1;
        }
    }

    return Math.max(fromInterest, utrRecords || 0, rivalPlayed);
}

// UTR dalları (tenis/padel/badminton/masa tenisi): tekli ve çiftler anketleri BAĞIMSIZ.
// Genel "bu dalı hiç kullanabilir miyim" kapısı İKİSİNDEN BİRİ tamamlanmışsa açılır;
// format-özel kapı (ilan aç/katıl) matchType'a göre ayrı kontrol edilir.
function hasGeneralAssessment(interest, subCategory) {
    if (!interest) return false;
    if (UTR_SUBCATEGORIES.includes(subCategory)) {
        return interest.assessmentCompleted || interest.doublesAssessmentCompleted;
    }
    return interest.assessmentCompleted;
}

// Motor türleri '1'..'4'. Eski anketlerde '5'..'8' oyları varsa kabul edilmeye devam eder
// (geriye dönük); yeni oluşturmada sadece aktif motorlar + formatConfig kullanılır.
export const VALID_TOURN_TYPES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

/** WhatsApp grup davet URL'si — sadece bilinen hostlar. */
function sanitizeWhatsappGroupUrl(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    try {
        const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
        const host = u.hostname.replace(/^www\./i, '').toLowerCase();
        if (host === 'chat.whatsapp.com' || host === 'wa.me' || host === 'api.whatsapp.com') {
            return u.toString();
        }
    } catch { /* invalid */ }
    return null;
}

// Defi ligi çift girişi (padel/tenis çiftler merdiveni) çiftler puanı + partner akışı kullanır.
const tIsDoubles = (t) => isDoublesFormat({ tournamentType: t.type }) || (isDefi(t) && defiSettingsOf(t).entry === 'PAIR');
const tAllowsPartner = (t) => t.type === '2' || t.type === '4' || (isDefi(t) && defiSettingsOf(t).entry === 'PAIR');
export { ACTIVE_ENGINE_TYPES };

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

/** Son başvuru anı (TR UTC+3) — join kontrolüyle aynı mantık. */
export function registrationDeadlineMs(endDate, endTime) {
    if (!endDate) return null;
    const regEnd = new Date(endDate);
    if (endTime) {
        const [h, m] = String(endTime).split(':').map(Number);
        regEnd.setUTCHours(h || 0, m || 0, 0, 0);
        regEnd.setTime(regEnd.getTime() - 3 * 60 * 60 * 1000);
    } else {
        // Saat yoksa gün sonu TR 23:59
        regEnd.setUTCHours(20, 59, 0, 0);
    }
    return regEnd.getTime();
}

/** OPEN + son başvuru geçmemişse katılım isteği olmadan da grup sohbetine girilebilir. */
function isOpenRegistrationChatWindow(tournament) {
    if (!tournament || tournament.status !== 'OPEN') return false;
    const deadline = registrationDeadlineMs(tournament.endDate, tournament.endTime);
    if (deadline == null) return true;
    return Date.now() <= deadline;
}

async function userCanAccessTournamentChat(tournament, userId) {
    if (!tournament || !userId) return false;
    if (tournament.creatorId === userId) return true;
    if (isOpenRegistrationChatWindow(tournament)) return true;
    const participant = await prisma.tournamentParticipant.findFirst({
        where: { tournamentId: tournament.id, userId, status: 'ACCEPTED' },
        select: { id: true },
    });
    return !!participant;
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
            p1Id: pair.p1.id, p1Name: sportDisplayName(pair.p1),
            p2Id: pair.p2.id, p2Name: sportDisplayName(pair.p2),
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
            p1Id: pair.p1.id, p1Name: sportDisplayName(pair.p1),
            p2Id: pair.p2.id, p2Name: sportDisplayName(pair.p2),
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
                p1Id: pair.p1.id, p1Name: sportDisplayName(pair.p1),
                p2Id: pair.p2.id, p2Name: sportDisplayName(pair.p2),
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
            p1Id:   isBye ? null : p1?.id,   p1Name: isBye ? null : sportDisplayName(p1),
            p2Id:   isBye ? null : p2?.id,   p2Name: isBye ? null : sportDisplayName(p2),
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

/** 3.'lük maçı taraflardan biri reddettiğinde veya 2 günlük kabul/tarih penceresi kaçırıldığında,
 *  3./4. sırayı gerçek maç oynanmadan, iki kaybedenin KENDİ yarı final maçındaki averajına (kazandığı
 *  oyun / toplam oyun oranı) göre belirler — daha yüksek averaja sahip olan 3., diğeri 4. olur.
 *  Averaj hesaplanamıyorsa (skor eksikse) stableTiebreakHash ile sabit/adil bir kura yapılır. */
export async function resolveThirdPlaceByAveraj(match) {
    const semis = await prisma.tournamentMatch.findMany({
        where: {
            tournamentId: match.tournamentId, phase: 'PLAYOFF', round: match.round - 1, isThirdPlaceMatch: false,
            OR: [{ p1Id: match.p1Id }, { p2Id: match.p1Id }, { p1Id: match.p2Id }, { p2Id: match.p2Id }],
        },
    });
    const averajOf = (playerId) => {
        const semi = semis.find(m => m.p1Id === playerId || m.p2Id === playerId);
        if (!semi?.score?.sets) return null;
        const side = semi.p1Id === playerId ? 'p1' : 'p2';
        let mine = 0, total = 0;
        for (const s of semi.score.sets) {
            // Maç tiebreak sayıları (10-8) oyun averajına girmez.
            if (s.matchTiebreak) continue;
            mine += (side === 'p1' ? s.p1 : s.p2) || 0; total += (s.p1 || 0) + (s.p2 || 0);
        }
        return total === 0 ? 0 : mine / total;
    };
    const av1 = averajOf(match.p1Id), av2 = averajOf(match.p2Id);
    const kura = () => stableTiebreakHash(match.tournamentId, match.p1Id) >= stableTiebreakHash(match.tournamentId, match.p2Id) ? match.p1Id : match.p2Id;
    let winnerId;
    if (av1 == null && av2 == null) winnerId = kura();
    else if (av1 == null) winnerId = match.p2Id;
    else if (av2 == null) winnerId = match.p1Id;
    else if (av1 === av2) winnerId = kura();
    else winnerId = av1 > av2 ? match.p1Id : match.p2Id;
    return prisma.tournamentMatch.update({ where: { id: match.id }, data: { status: 'FORFEIT', winnerId } });
}

/** İki taraf arasındaki GROUP maçlarından ikili averaj (head-to-head).
 *  Sıra: karşılıklı puan → set averajı → oyun averajı. Maç yoksa 0. */
function compareHeadToHead(aId, bId, matches) {
    if (!aId || !bId || !Array.isArray(matches) || matches.length === 0) return 0;
    let aPts = 0, bPts = 0, aSetsW = 0, aSetsL = 0, aGamesW = 0, aGamesL = 0;
    for (const m of matches) {
        if (m.phase !== 'GROUP' || (m.status !== 'COMPLETED' && m.status !== 'FORFEIT' && m.status !== 'BYE')) continue;
        const aIsP1 = m.p1Id === aId && m.p2Id === bId;
        const aIsP2 = m.p1Id === bId && m.p2Id === aId;
        if (!aIsP1 && !aIsP2) continue;
        const sc = m.score || {};
        let p1s = 0, p2s = 0, p1g = 0, p2g = 0;
        for (const set of (sc.sets || [])) {
            if (!set.matchTiebreak) { p1g += set.p1 || 0; p2g += set.p2 || 0; }
            if ((set.p1 || 0) > (set.p2 || 0)) p1s++; else if ((set.p2 || 0) > (set.p1 || 0)) p2s++;
        }
        const mySetsW = aIsP1 ? p1s : p2s;
        const mySetsL = aIsP1 ? p2s : p1s;
        const myGamesW = aIsP1 ? p1g : p2g;
        const myGamesL = aIsP1 ? p2g : p1g;
        aSetsW += mySetsW; aSetsL += mySetsL;
        aGamesW += myGamesW; aGamesL += myGamesL;
        if (sc.autoDraw || (sc.winner !== 'p1' && sc.winner !== 'p2')) {
            aPts += 1; bPts += 1;
        } else if ((sc.winner === 'p1' && aIsP1) || (sc.winner === 'p2' && aIsP2) || m.winnerId === aId) {
            aPts += 3;
        } else {
            bPts += 3;
        }
    }
    if (aPts !== bPts) return bPts - aPts;
    const setAv = (w, l) => { const t = w + l; return t === 0 ? 0 : w / t; };
    // aSetsL = b'nin a'ya karşı kazandığı setler
    const bSetsW = aSetsL, bSetsL = aSetsW;
    if (Math.abs(setAv(bSetsW, bSetsL) - setAv(aSetsW, aSetsL)) > 0.001) {
        return setAv(bSetsW, bSetsL) - setAv(aSetsW, aSetsL);
    }
    const gameAv = (w, l) => { const t = w + l; return t === 0 ? 0 : w / t; };
    const bGamesW = aGamesL, bGamesL = aGamesW;
    if (Math.abs(gameAv(bGamesW, bGamesL) - gameAv(aGamesW, aGamesL)) > 0.001) {
        return gameAv(bGamesW, bGamesL) - gameAv(aGamesW, aGamesL);
    }
    return 0;
}

/** Real-stat comparator: puan → oyun averajı → set averajı → oyun oranı → ikili averaj,
 *  without the final kura fallback. Returns 0 only when two standings rows are genuinely
 *  indistinguishable — used to detect a tie straddling the playoff cutoff so an extra
 *  round can be played instead of deciding qualification by lot.
 *  `matches` verilirse puan/averaj/set/oyun eşitliğinde ikili averaj (head-to-head) bakılır. */
function compareStandingsCore(a, b, tournamentType, matches = null) {
    if (b.points !== a.points) return b.points - a.points;
    if (['1', '2', '3', '4', '5', '6', '7'].includes(String(tournamentType))) {
        const averaj = (x) => {
            const total = x.gamesWon + x.gamesLost;
            return total === 0 ? 0 : x.gamesWon / total;
        };
        if (Math.abs(averaj(b) - averaj(a)) > 0.001) return averaj(b) - averaj(a);
    }
    // Set averajı (kazanılan set / toplam set)
    const setAveraj = (x) => {
        const total = x.setsWon + x.setsLost;
        return total === 0 ? 0 : x.setsWon / total;
    };
    if (Math.abs(setAveraj(b) - setAveraj(a)) > 0.001) return setAveraj(b) - setAveraj(a);
    // Oyun oranı (kazanılan oyun / kaybedilen oyun) — set averajından sonra
    const gr = (x) => x.gamesLost === 0 ? (x.gamesWon === 0 ? 0 : Infinity) : x.gamesWon / x.gamesLost;
    if (gr(b) !== gr(a)) return gr(b) - gr(a);
    // İkili averaj (aralarındaki maç)
    if (matches) {
        const h2h = compareHeadToHead(a.userId, b.userId, matches);
        if (h2h !== 0) return h2h;
    }
    return 0;
}

/** Compute GROUP-phase standings from completed matches.
 *  Tiebreaker: puan → oyun averajı → set averajı → oyun oranı → ikili averaj → (hepsi eşitse) sabit kura
 */
function computeStandings(players, matches, tournamentType, tournamentId) {
    const stats = {};
    for (const p of players) {
        stats[p.id] = { userId: p.id, name: sportDisplayName(p), played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 0 };
    }
    for (const m of matches) {
        if ((m.status !== 'COMPLETED' && m.status !== 'FORFEIT') || !m.score || m.phase !== 'GROUP') continue;
        const sc = m.score;
        const s1 = stats[m.p1Id], s2 = stats[m.p2Id];
        if (!s1 || !s2) continue;
        s1.played++; s2.played++;
        // Otomatik/berabere 0-0: her iki tarafa 1 puan (mobil puan tablosu ile aynı).
        if (sc.autoDraw || (sc.winner !== 'p1' && sc.winner !== 'p2')) {
            s1.points += 1; s2.points += 1;
            continue;
        }
        let p1s = 0, p2s = 0, p1g = 0, p2g = 0;
        for (const set of (sc.sets || [])) {
            if (!set.matchTiebreak) { p1g += set.p1 || 0; p2g += set.p2 || 0; }
            if ((set.p1 || 0) > (set.p2 || 0)) p1s++; else if ((set.p2 || 0) > (set.p1 || 0)) p2s++;
        }
        s1.setsWon += p1s; s1.setsLost += p2s; s1.gamesWon += p1g; s1.gamesLost += p2g;
        s2.setsWon += p2s; s2.setsLost += p1s; s2.gamesWon += p2g; s2.gamesLost += p1g;
        if (sc.winner === 'p1') { s1.won++; s1.points += 3; s2.lost++; }
        else if (sc.winner === 'p2') { s2.won++; s2.points += 3; s1.lost++; }
    }
    // Swiss bye: tek taraflı BYE maçı → +3 puan / +1 galibiyet
    applyByeToStandings(stats, matches);
    return Object.values(stats).sort((a, b) => {
        const core = compareStandingsCore(a, b, tournamentType, matches);
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
                p1Name: sportDisplayName(pair.a),
                p2Id: pair.b.id,
                p2Name: sportDisplayName(pair.b),
                status: 'PENDING',
                deadline,
            });
        });
    }
    return matches;
}

/** Americano bir tur: geçici takımlar + maçlar. history bracketData.americano'dan gelir. */
async function createAmericanoRoundMatches(tournament, players, round, history, baseDate) {
    const pairing = pairAmericanoRound(players, history, round);
    if (pairing.courts.length === 0) return { matches: [], history };

    const teamCreates = [];
    const matchRows = [];
    const deadline = new Date(baseDate);
    deadline.setDate(deadline.getDate() + round * 7);

    for (let idx = 0; idx < pairing.courts.length; idx++) {
        const { a, b } = pairing.courts[idx];
        const avg = (pair) => ((pair[0].skillRating || 0) + (pair[1].skillRating || 0)) / 2;
        teamCreates.push({
            tournamentId: tournament.id,
            player1Id: a[0].id,
            player1Name: sportDisplayName(a[0]),
            player2Id: a[1].id,
            player2Name: sportDisplayName(a[1]),
            avgRating: avg(a),
        });
        teamCreates.push({
            tournamentId: tournament.id,
            player1Id: b[0].id,
            player1Name: sportDisplayName(b[0]),
            player2Id: b[1].id,
            player2Name: sportDisplayName(b[1]),
            avgRating: avg(b),
        });
    }

    const createdTeams = await prisma.$transaction(teamCreates.map(td => prisma.tournamentTeam.create({ data: td })));
    for (let i = 0; i < pairing.courts.length; i++) {
        const t1 = createdTeams[i * 2];
        const t2 = createdTeams[i * 2 + 1];
        matchRows.push({
            tournamentId: tournament.id,
            round,
            phase: 'GROUP',
            matchIndex: i,
            p1Id: t1.id,
            p1Name: `${t1.player1Name} & ${t1.player2Name}`,
            p2Id: t2.id,
            p2Name: `${t2.player1Name} & ${t2.player2Name}`,
            status: 'PENDING',
            deadline,
        });
    }

    const nextHistory = {
        partners: [...(history.partners || []), ...(pairing.newPartners || [])],
        opponents: [...(history.opponents || []), ...(pairing.newOpponents || [])],
        sitOutLog: [...(history.sitOutLog || []), ...(pairing.sitOut || []).map(p => p.id)],
    };
    return { matches: matchRows, history: nextHistory };
}

async function generateNextSwissRound(tournament, players, nextRound, groupMatches) {
    const standings = computeStandings(players, groupMatches, tournament.type, tournament.id);
    const byId = new Map(players.map(p => [p.id, p]));
    const enriched = standings.map(s => {
        const base = byId.get(s.userId) || { id: s.userId, fullName: s.name, username: s.name };
        const hadBye = groupMatches.some(m => m.status === 'BYE' && m.winnerId === s.userId);
        return {
            ...base,
            id: s.userId,
            points: s.points,
            gamesWon: s.gamesWon,
            gamesLost: s.gamesLost,
            hadBye,
        };
    });
    // standings'te olmayan (hiç oynamamış) oyuncular
    for (const p of players) {
        if (!enriched.find(e => e.id === p.id)) {
            enriched.push({ ...p, points: 0, gamesWon: 0, gamesLost: 0, hadBye: false });
        }
    }
    const playedPairKeys = groupMatches
        .filter(m => m.p1Id && m.p2Id)
        .map(m => [m.p1Id, m.p2Id].sort().join('|'));
    const pairing = pairSwissRound(enriched, playedPairKeys);
    const baseDate = tournamentBaseDate(tournament);
    const deadline = new Date(baseDate);
    deadline.setDate(deadline.getDate() + nextRound * 7);
    return swissMatchesFromPairing(tournament.id, nextRound, pairing, deadline);
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
                    },
                },
            },
        },
    });
    const isDoubles = isDoublesFormat({ tournamentType: tournament.type });
    return participants.filter(p => p.userId && p.user).map(p => ({
        id: p.userId,
        fullName: p.user.fullName || null,
        username: p.user.username || null,
        alias: p.user.interests?.[0]?.alias || null,
        skillRating: getDisplayRating(p.user.interests?.[0], tournament.subCategory, isDoubles),
    }));
}

// Çiftler Rekabetçi (type '2'): takımın güncel ortalama ELO'su — üyelerin o anki skillRating'inden hesaplanır.
async function getCurrentTeamRatings(tournament, teamIds) {
    const teams = await prisma.tournamentTeam.findMany({ where: { id: { in: teamIds } } });
    const memberIds = [...new Set(teams.flatMap(t => [t.player1Id, t.player2Id]))];
    const interests = await prisma.userInterest.findMany({
        where: { userId: { in: memberIds }, category: tournament.category, subCategory: tournament.subCategory },
    });
    const isDoubles = isDoublesFormat({ tournamentType: tournament.type });
    const ratingOf = (uid) => getDisplayRating(interests.find(i => i.userId === uid), tournament.subCategory, isDoubles);
    return teams.map(t => ({
        id: t.id,
        fullName: `${t.player1Name} & ${t.player2Name}`,
        username: `${t.player1Name} & ${t.player2Name}`,
        skillRating: (ratingOf(t.player1Id) + ratingOf(t.player2Id)) / 2,
    }));
}

/** Maç joker / karşılıklı joker ile uzatıldı mı?
 *  p*JokerRequested hâlâ true olabilir; karşılıklı onayda flag'ler temizlenir ama
 *  deadline nominal süreden uzun kalır — ikisini de kabul ediyoruz.
 *  jokerUserIds: bu turnuvada jokerUsed=true olan userId set'i (opsiyonel güçlendirme).
 */
function matchExtendedByJoker(tournament, match, roundNum, jokerUserIds = null) {
    if (!match || match.status !== 'PENDING') return false;
    if (match.p1JokerRequested || match.p2JokerRequested) return true;
    // Tekli: p1Id/p2Id user id. Taraflardan biri joker hakkını bu turnuvada kullandıysa
    // (flag karşılıklı onayda silinse bile) bu PENDING maç joker uzatmalı sayılır.
    if (jokerUserIds && jokerUserIds.size) {
        if ((match.p1Id && jokerUserIds.has(match.p1Id)) || (match.p2Id && jokerUserIds.has(match.p2Id))) {
            return true;
        }
    }
    if (!match.deadline) return false;
    const nominal = new Date(tournamentBaseDate(tournament));
    nominal.setDate(nominal.getDate() + (roundNum || match.round || 1) * 7);
    // +1 saat tolerans — saat dilimi / yuvarlama kayması joker sanılmasın
    return new Date(match.deadline).getTime() > nominal.getTime() + 60 * 60 * 1000;
}

/**
 * Tip '1' Elo grup: bir tur "ilerlemeye hazır" mı? (tur deadline'ının son gün/saatini BEKLEMEZ)
 *  - Tüm maçlar bitti (erkense de) → evet → sonraki tur herkesin YENİ Elo'su ile
 *  - Kalan PENDING'lerin hepsi joker'li → evet → joker tarafları o anki Elo, diğerleri yeni Elo
 *  - Joker-dışı PENDING kaldıysa → hayır (o maçlar bitene / joker kullanılana kadar bekle)
 */
function eloRoundReadyToAdvance(tournament, roundMatches, roundNum, jokerUserIds = null) {
    if (!roundMatches.length) return false;
    const pending = roundMatches.filter(m => m.status === 'PENDING');
    if (pending.length === 0) {
        return roundMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.status === 'FORFEIT');
    }
    const blocking = pending.filter(m => !matchExtendedByJoker(tournament, m, roundNum, jokerUserIds));
    return blocking.length === 0;
}

async function loadJokerUserIds(tournamentId) {
    const rows = await prisma.tournamentParticipant.findMany({
        where: { tournamentId, status: 'ACCEPTED', jokerUsed: true, userId: { not: null } },
        select: { userId: true },
    });
    return new Set(rows.map(r => r.userId));
}

/** Müsaitlik motoru açıksa yeni Elo turunu TournamentRound kaydına bağla; admin PENDING_APPROVAL atlanır. */
async function linkEloRoundToAvailability(tournament, roundIndex) {
    if (!tournament.availabilityMatchEnabled) return;
    const tr = await prisma.tournamentRound.findFirst({
        where: { tournamentId: tournament.id, roundIndex },
    });
    if (!tr) return;
    await prisma.tournamentMatch.updateMany({
        where: { tournamentId: tournament.id, phase: 'GROUP', round: roundIndex },
        data: { roundId: tr.id },
    });
    await prisma.tournamentRound.update({
        where: { id: tr.id },
        data: {
            status: 'ACTIVE',
            proposedMatches: [],
            matchingApprovedAt: new Date(),
        },
    });
}

/**
 * Tip '1': henüz oynanmamış (hepsi PENDING) gelecek turları siler.
 *  - Erken/yanlış admin-onaylı veya eski Elo ile üretilmiş tur 2+ temizlensin diye
 *  - Skorlar girilince generateNextEloRound güncel Elo ile yeniden kurar
 * Dönüş: silinen maç sayısı.
 */
async function healType1PendingFutureEloRounds(tournament) {
    if (String(tournament.type) !== '1' || tournament.status !== 'IN_PROGRESS') return 0;

    const allGroup = await prisma.tournamentMatch.findMany({
        where: { tournamentId: tournament.id, phase: 'GROUP' },
        select: {
            id: true, round: true, status: true, deadline: true,
            p1Id: true, p2Id: true,
            p1JokerRequested: true, p2JokerRequested: true,
        },
    });
    if (!allGroup.length) return 0;

    const jokerUserIds = await loadJokerUserIds(tournament.id);
    const rounds = [...new Set(allGroup.map(m => m.round))].sort((a, b) => a - b);
    const deleteIds = new Set();

    // Önceki turda joker-dışı PENDING varken sonraki (hepsi PENDING) turlar prematüre → sil
    for (const r of rounds) {
        const ms = allGroup.filter(m => m.round === r);
        const blocking = ms.filter(m => m.status === 'PENDING' && !matchExtendedByJoker(tournament, m, r, jokerUserIds));
        if (!blocking.length) continue;
        for (const hr of rounds.filter(x => x > r)) {
            const hms = allGroup.filter(m => m.round === hr);
            if (hms.length && hms.every(m => m.status === 'PENDING')) {
                hms.forEach(m => deleteIds.add(m.id));
            } else {
                break;
            }
        }
        break;
    }

    // Tek seferlik: tur ≥2 hâlâ tamamen PENDING ise sil — skor sonrası güncel Elo ile kurulsun
    // (kullanıcı: "tur 2 yi sil sonuçlar girilince otomatik oluştur")
    const meta = (tournament.bracketData && typeof tournament.bracketData === 'object')
        ? tournament.bracketData
        : {};
    let clearedAvailDrafts = false;
    if (!meta.eloAutoRoundHealV1) {
        const future = allGroup.filter(m => m.round >= 2);
        if (future.length && future.every(m => m.status === 'PENDING')) {
            future.forEach(m => deleteIds.add(m.id));
        }
        // Admin onay bekleyen müsaitlik taslağı da düşsün — Elo turu skor sonrası otomatik
        if (tournament.availabilityMatchEnabled) {
            const cleared = await prisma.tournamentRound.updateMany({
                where: {
                    tournamentId: tournament.id,
                    roundIndex: { gte: 2 },
                    status: { in: ['PENDING_APPROVAL', 'UPCOMING', 'AVAIL_OPEN'] },
                },
                data: {
                    status: 'UPCOMING',
                    proposedMatches: [],
                    matchingApprovedAt: null,
                    lastFingerprint: null,
                },
            });
            clearedAvailDrafts = (cleared?.count || 0) > 0;
        }
        await prisma.tournament.update({
            where: { id: tournament.id },
            data: { bracketData: { ...meta, eloAutoRoundHealV1: true } },
        });
        tournament.bracketData = { ...meta, eloAutoRoundHealV1: true };
    }

    if (!deleteIds.size) return clearedAvailDrafts ? 1 : 0;

    const ids = [...deleteIds];
    await prisma.tournamentMatch.deleteMany({ where: { id: { in: ids } } });

    // Müsaitlik turlarındaki taslak / PENDING_APPROVAL'ı da temizle
    if (tournament.availabilityMatchEnabled) {
        const deletedRounds = [...new Set(
            allGroup.filter(m => deleteIds.has(m.id)).map(m => m.round),
        )];
        if (deletedRounds.length) {
            await prisma.tournamentRound.updateMany({
                where: {
                    tournamentId: tournament.id,
                    roundIndex: { in: deletedRounds },
                },
                data: {
                    status: 'UPCOMING',
                    proposedMatches: [],
                    matchingApprovedAt: null,
                    lastFingerprint: null,
                },
            });
        }
    }
    return ids.length;
}

/** Bireysel Rekabetçi (type '1') ve Çiftler Rekabetçi (type '2'): DB'den o anki ELO
 *  alarak sonraki GROUP turunu oluşturur.
 *  Skoru girilmiş oyuncu → yeni Elo; jokerli henüz oynamamış → o anki (eski) Elo.
 *  Aynı çift tekrar eşleşmez. Deadline = eventDate + round*7 gün (kurulum anı; tur bitişini beklemez).
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
        p1Name: sportDisplayName(pair.p1),
        p2Id: pair.p2.id,
        p2Name: sportDisplayName(pair.p2),
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
    const nameOf   = (p) => sportDisplayName(p.user, p.user?.interests?.[0]);
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

/**
 * Turları sıfırla: tüm maçları sil, ELO etkilerini geri al, turnuvayı OPEN'a çek.
 * İstemci çift onaydan sonra /start ile yeniden başlatır.
 */
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
        if (tournament.status !== 'IN_PROGRESS' && tournament.status !== 'COMPLETED') {
            return res.status(400).json({ message: 'Sadece devam eden veya bitmiş turnuva sıfırlanabilir' });
        }
        if (isDefi(tournament)) return res.status(400).json({ message: 'Defi ligi bu şekilde sıfırlanamaz' });

        const allMatches = await prisma.tournamentMatch.findMany({ where: { tournamentId: id } });
        const completed = allMatches.filter(m => m.status === 'COMPLETED' || m.status === 'FORFEIT');
        for (const m of completed) {
            await reverseCompletedMatchElo(tournament, m);
        }

        await prisma.$transaction([
            prisma.tournamentMatch.deleteMany({ where: { tournamentId: id } }),
            prisma.tournamentTeam.deleteMany({ where: { tournamentId: id } }),
            prisma.tournamentParticipant.updateMany({
                where: { tournamentId: id },
                data: { jokerUsed: false, jokerUsedAt: null, mutualJokerUsed: false },
            }),
            prisma.tournament.update({
                where: { id },
                data: {
                    status: 'OPEN',
                    startedAt: null,
                    completedAt: null,
                    bracketData: null,
                },
            }),
        ]);
        try {
            await prisma.tournamentRound.deleteMany({ where: { tournamentId: id } });
        } catch { /* tur tablosu boş/yok */ }

        const updated = await prisma.tournament.findUnique({
            where: { id },
            include: {
                participants: { where: { status: 'ACCEPTED' }, select: { id: true, userId: true, status: true } },
            },
        });
        res.json({
            tournament: updated,
            wipedMatches: allMatches.length,
            wipedCompleted: completed.length,
            status: 'OPEN',
            restarted: true,
        });
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
            prize1, prize2, prize3, surpriseGifts, contactPhone, whatsappGroupUrl,
            minPlayers, maxPlayers, minRating, maxRating,
            ratingGenderSplit, minRatingMale, maxRatingMale, minRatingFemale, maxRatingFemale,
            matchmakingType, matchFrequency, matchTimeStart, matchTimeEnd, dayTrip,
            availabilityMatchEnabled,
            setsPerMatch, advantageScoring, decidingTiebreak, matchesBeforePlayoff, playoffQualifiers,
            teamSize, teamRequiredMaleCount,
            rules, extraServices,
            location, city,
            venueId, venueCourtId,
            surface, isIndoor,
            eventDate, eventTime, eventEndDate, eventEndTime,
            startDate, startTime, endDate, endTime,
            pollEnabled, pollEndDate, pollEndTime, pollTypes,
            formatConfig: rawFormatConfig,
        } = req.body;
        if (pollEnabled === true && !pollEndDate) {
            return res.status(400).json({ message: 'Anket bitiş tarihi zorunludur.' });
        }
        if (endDate) {
            const ms = registrationDeadlineMs(endDate, endTime);
            if (ms != null && ms <= Date.now()) {
                return res.status(400).json({ message: 'Son başvuru tarih ve saati geçmiş olamaz.' });
            }
        }
        if (eventDate && eventTime) {
            const ms = registrationDeadlineMs(eventDate, eventTime);
            if (ms != null && ms <= Date.now()) {
                return res.status(400).json({ message: 'Turnuva başlangıç tarih ve saati geçmiş olamaz.' });
            }
        }
        if (eventEndDate && eventEndTime) {
            const ms = registrationDeadlineMs(eventEndDate, eventEndTime);
            if (ms != null && ms <= Date.now()) {
                return res.status(400).json({ message: 'Tahmini bitiş tarih ve saati geçmiş olamaz.' });
            }
        }
        if (pollEnabled === true && pollEndDate) {
            const pollMs = registrationDeadlineMs(pollEndDate, pollEndTime || '23:59');
            if (pollMs != null && pollMs <= Date.now()) {
                return res.status(400).json({ message: 'Anket bitiş tarih ve saati geçmiş olamaz.' });
            }
        }
        let cleanExtraServices = [];
        if (extraServices !== undefined) {
            cleanExtraServices = sanitizeExtraServices(extraServices);
            if (cleanExtraServices === null) return res.status(400).json({ message: 'Geçersiz ekstra hizmet' });
        }
        let validPollTypes = null;
        if (pollEnabled === true) {
            const uniq = Array.isArray(pollTypes)
                ? [...new Set(pollTypes)].filter(tp => ACTIVE_ENGINE_TYPES.includes(String(tp)))
                : [];
            if (uniq.length < 2) {
                return res.status(400).json({ message: 'Anket için en az 2 turnuva formatı seçmelisiniz.' });
            }
            validPollTypes = uniq;
        }
        const resolved = pollEnabled === true
            ? { type: null, formatConfig: null }
            : resolveFormatOnCreate({ type, formatConfig: rawFormatConfig, matchmakingType, subCategory });
        if (resolved.type === '9' && !DEFI_SUBS.includes(subCategory)) {
            return res.status(400).json({ message: 'Defi ligi bu dalda kullanılamıyor' });
        }
        let cleanWa = null;
        if (whatsappGroupUrl != null && String(whatsappGroupUrl).trim()) {
            cleanWa = sanitizeWhatsappGroupUrl(whatsappGroupUrl);
            if (!cleanWa) return res.status(400).json({ message: 'Geçersiz WhatsApp grup linki (chat.whatsapp.com veya wa.me olmalı).' });
        }
        const tournament = await prisma.tournament.create({
            data: {
                name,
                type: pollEnabled === true ? null : resolved.type,
                formatConfig: pollEnabled === true ? null : resolved.formatConfig,
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
                whatsappGroupUrl: cleanWa,
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
                availabilityMatchEnabled: availabilityMatchEnabled === true,
                minPlayers: minPlayers ? parseInt(minPlayers) : 2,
                setsPerMatch: setsPerMatch ? parseInt(setsPerMatch) : null,
                // true/false/null (serbest) istemciden geldiği gibi kaydedilir — sadece hiç
                // gönderilmediyse (undefined) şema varsayılanı (true) devreye girsin diye dokunulmaz.
                ...(advantageScoring !== undefined && { advantageScoring }),
                // 3 set + deciding → 1-1'de 3. set süper TB; 5 set + deciding → 2-2'de 5. set süper TB.
                // (Eski 2+TB kayıtları skor tarafında hâlâ 3 set STB gibi okunur.)
                decidingTiebreak: !!decidingTiebreak && isRacketSetSport(subCategory)
                    && [3, 5].includes(parseInt(setsPerMatch)),
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
                venueId: venueId || null,
                venueCourtId: venueCourtId || null,
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
                _count:  { select: { participants: { where: { status: 'ACCEPTED' } }, messages: true } },
                participants: { where: { userId: myId }, select: { userId: true, status: true } },
                typeVotes: { select: { userId: true, votedType: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        // Son başvuru geçmiş + min oyuncu yok: halka açık listede gizle (hazırlayan hâlâ görür —
        // 24s içinde uzatma / silinme uyarısı için). Home feed de aynı endpoint'i kullanır.
        const nowMs = Date.now();
        const visible = tournaments.filter(t => {
            if (t.creatorId === myId) return true;
            if (t.status !== 'OPEN') return true;
            const deadline = registrationDeadlineMs(t.endDate, t.endTime);
            if (deadline == null || deadline > nowMs) return true;
            const accepted = t._count?.participants ?? 0;
            if (accepted >= (t.minPlayers || 2)) return true;
            return false;
        });
        res.json(visible);
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
                _count:  { select: { participants: { where: { status: 'ACCEPTED' } }, messages: true } },
                participants: { where: { userId: myId }, select: { userId: true, status: true } },
                typeVotes: { select: { userId: true, votedType: true } },
                rounds: { orderBy: { roundIndex: 'asc' } },
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
        }),
        prisma.user.findUnique({ where: { id: userId }, select: { tournamentBanRemaining: true, gender: true } }),
    ]);
    if (!hasGeneralAssessment(interest, tournament.subCategory)) {
        return { ok: false, message: 'Derecelendirme anketini tamamlamadığınız için otomatik başvurunuz oluşturulamadı.' };
    }
    if (UTR_SUBCATEGORIES.includes(tournament.subCategory) && isDoublesFormat({ tournamentType: tournament.type }) && !interest.doublesAssessmentCompleted) {
        return { ok: false, message: 'Çiftler derecelendirme anketini tamamlamadığınız için otomatik başvurunuz oluşturulamadı.' };
    }
    if (TENNIS_PADEL_SUBCATEGORIES.includes(tournament.subCategory)) {
        const played = await countAppMatchesForTournament(userId, tournament.category, tournament.subCategory, interest);
        if (played < MIN_MATCHES_FOR_TOURNAMENT) {
            return { ok: false, message: `Bu spor dalında en az ${MIN_MATCHES_FOR_TOURNAMENT} maç yapmadığınız için otomatik başvurunuz oluşturulamadı.` };
        }
    }
    if (userRec?.tournamentBanRemaining > 0) {
        return { ok: false, message: 'Geç iptal cezası nedeniyle şu anda turnuvalara katılamadığınız için otomatik başvurunuz oluşturulamadı.' };
    }
    const userRating = getDisplayRating(interest, tournament.subCategory, isDoublesFormat({ tournamentType: tournament.type }));
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
        const { note, partnerId, teamName } = req.body;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        if (partnerId) {
            if (!tAllowsPartner(tournament)) return res.status(400).json({ message: 'Partner seçimi sadece Çiftler Rekabetçi ve Çiftler Antrenman turnuvalarda mümkün' });
            if (partnerId === req.userId) return res.status(400).json({ message: 'Kendinizi partner olarak seçemezsiniz' });
            const partnerInterest = await prisma.userInterest.findUnique({
                where: { userId_category_subCategory: { userId: partnerId, category: tournament.category, subCategory: tournament.subCategory } },
                select: {
                    assessmentCompleted: true,
                    doublesAssessmentCompleted: true,
                    wins: true,
                    losses: true,
                    singlesMatchCount: true,
                    doublesMatchCount: true,
                    matchesSinceAssessment: true,
                },
            });
            if (!hasGeneralAssessment(partnerInterest, tournament.subCategory)) {
                return res.status(400).json({ message: 'Seçtiğiniz partner bu spor dalında henüz derecelendirme anketini tamamlamamış' });
            }
            if (UTR_SUBCATEGORIES.includes(tournament.subCategory) && !partnerInterest.doublesAssessmentCompleted) {
                return res.status(400).json({ message: 'Seçtiğiniz partner henüz çiftler derecelendirme anketini tamamlamamış' });
            }
            if (TENNIS_PADEL_SUBCATEGORIES.includes(tournament.subCategory)) {
                const partnerPlayed = await countAppMatchesForTournament(
                    partnerId, tournament.category, tournament.subCategory, partnerInterest,
                );
                if (partnerPlayed < MIN_MATCHES_FOR_TOURNAMENT) {
                    return res.status(400).json({ message: `Seçtiğiniz partner bu spor dalında henüz en az ${MIN_MATCHES_FOR_TOURNAMENT} maç yapmamış` });
                }
            }
        }

        const myInterest = await prisma.userInterest.findUnique({
            where: { userId_category_subCategory: { userId: req.userId, category: tournament.category, subCategory: tournament.subCategory } },
            select: {
                assessmentCompleted: true,
                doublesAssessmentCompleted: true,
                wins: true,
                losses: true,
                singlesMatchCount: true,
                doublesMatchCount: true,
                matchesSinceAssessment: true,
            },
        });
        if (!hasGeneralAssessment(myInterest, tournament.subCategory)) {
            return res.status(403).json({ message: 'Bu spor dalında maçlara katılabilmek için önce derecelendirme anketini tamamlamanız gerekiyor.' });
        }
        if (UTR_SUBCATEGORIES.includes(tournament.subCategory) && tIsDoubles(tournament) && !myInterest.doublesAssessmentCompleted) {
            return res.status(403).json({ message: 'Bu turnuvaya katılabilmek için önce çiftler derecelendirme anketini tamamlamanız gerekiyor.' });
        }
        // UTR tekli turnuva: çiftler anketi tekliyi karşılamaz (bağımsız Elo).
        if (UTR_SUBCATEGORIES.includes(tournament.subCategory) && !tIsDoubles(tournament) && !myInterest.assessmentCompleted) {
            return res.status(403).json({ message: 'Bu turnuvaya katılabilmek için önce tekli derecelendirme anketini tamamlamanız gerekiyor.' });
        }
        if (TENNIS_PADEL_SUBCATEGORIES.includes(tournament.subCategory)) {
            const played = await countAppMatchesForTournament(
                req.userId, tournament.category, tournament.subCategory, myInterest,
            );
            if (played < MIN_MATCHES_FOR_TOURNAMENT) {
                return res.status(403).json({ message: `Bu turnuvaya katılabilmek için bu spor dalında uygulama üzerinden en az ${MIN_MATCHES_FOR_TOURNAMENT} maç yapmış olmanız gerekiyor.` });
            }
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
        // Defi ligi sezon boyunca açık: yeni gelen son sıradan girer (bkz. defiLadder.js syncLadder).
        if (tournament.status === 'IN_PROGRESS' && !isDefi(tournament)) {
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
            }),
        ]);
        if (userBan?.tournamentBanRemaining > 0) {
            await prisma.user.update({ where: { id: req.userId }, data: { tournamentBanRemaining: { decrement: 1 } } });
            return res.status(403).json({ message: `Geç iptal cezası nedeniyle ${userBan.tournamentBanRemaining} turnuvaya daha katılamazsınız.` });
        }

        // Check rating limits — cinsiyete göre ayrı aralık seçiliyse (ör. erkek 3-4, kadın 4-5)
        // katılımcının cinsiyetine göre uygun aralık kullanılır; cinsiyeti belirtilmemiş/OTHER
        // olan kullanıcılar için derece kısıtlaması uygulanmaz.
        const userRating = getDisplayRating(userInterest, tournament.subCategory, tIsDoubles(tournament));
        const cleanTeamName = isDefi(tournament) && defiSettingsOf(tournament).entry === 'TEAM'
            ? String(teamName || '').trim().slice(0, 40) : '';
        if (isDefi(tournament) && defiSettingsOf(tournament).entry === 'TEAM' && !cleanTeamName) {
            return res.status(400).json({ message: 'Takım adı zorunlu' });
        }
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
            data: { tournamentId: id, userId: req.userId, partnerId: partnerId || null, teamName: cleanTeamName || null, note, status: "PENDING", acceptedAt: null },
            include: {
                user: {
                    select: {
                        id: true, username: true, fullName: true, avatar: true,
                        interests: {
                            where: { category: tournament.category, subCategory: tournament.subCategory },
                            select: { skillRating: true, level: true, assessmentCompleted: true, alias: true },
                        },
                    },
                },
            },
        });

        emitToUser(tournament.creatorId, 'tournament:join_requested', { tournamentId: id, participant });
        const joinDisplayName = sportDisplayName(participant.user, participant.user?.interests?.[0]);
        createNotification(
            tournament.creatorId,
            'TOURNAMENT_JOIN_REQUEST',
            '📬 Katılım İsteği',
            `${joinDisplayName} "${tournament.name}" turnuvasına katılmak istiyor.`,
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
                    : `${joinDisplayName} sizi "${tournament.name}" turnuvasında çift partneri olarak seçti. Aynı turnuvaya onu partner göstererek başvurursanız çift olarak eşleşirsiniz.`,
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
        if (!tAllowsPartner(tournament)) return res.status(400).json({ message: 'Partner seçimi sadece Çiftler Rekabetçi ve Çiftler Antrenman turnuvalarda mümkün' });

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
                select: { assessmentCompleted: true, doublesAssessmentCompleted: true },
            });
            if (!hasGeneralAssessment(partnerInterest, tournament.subCategory)) {
                return res.status(400).json({ message: 'Seçtiğiniz partner bu spor dalında henüz derecelendirme anketini tamamlamamış' });
            }
            if (UTR_SUBCATEGORIES.includes(tournament.subCategory) && !partnerInterest.doublesAssessmentCompleted) {
                return res.status(400).json({ message: 'Seçtiğiniz partner henüz çiftler derecelendirme anketini tamamlamamış' });
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
                            select: { skillRating: true, level: true, assessmentCompleted: true, alias: true },
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
            const partnerDisplayName = sportDisplayName(updated.user, updated.user?.interests?.[0]);
            createNotification(
                partnerId, 'TOURNAMENT_JOIN', mutual ? '🤝 Çift Eşleşmesi Tamamlandı' : '🤝 Çift Daveti',
                mutual
                    ? `"${tournament.name}" turnuvasında çift olarak eşleştiniz.`
                    : `${partnerDisplayName} sizi "${tournament.name}" turnuvasında çift partneri olarak seçti. Onu partner göstererek seçerseniz çift olarak eşleşirsiniz.`,
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
        if (tournament.creatorId !== req.userId && !tAllowsPartner(tournament)) {
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
                            select: { skillRating: true, level: true, assessmentCompleted: true, alias: true },
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
                            select: { skillRating: true, level: true, assessmentCompleted: true, alias: true },
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
            createNotification(
                userId,
                'TOURNAMENT_JOIN_ACCEPTED',
                '🎉 Turnuvaya Kabul Edildiniz',
                `"${tournament.name}" turnuvasına başvurunuz kabul edildi.`,
                { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
            emitToUser(userId, 'notification', {});
            prisma.tournamentParticipant.findMany({
                where: { tournamentId: id, status: 'ACCEPTED' },
                select: { userId: true },
            }).then(accepted => {
                const payload = { tournamentId: id, participant: updated };
                accepted.forEach(p => {
                    if (p.userId) emitToUser(p.userId, 'tournament:participant_accepted', payload);
                });
            }).catch(() => {});
        } else if (status === 'REJECTED') {
            const body = reason ? `"${tournament.name}" turnuvasına başvurunuz reddedildi. Neden: ${reason}` : `"${tournament.name}" turnuvasına başvurunuz reddedildi.`;
            createNotification(userId, 'TOURNAMENT_REJECT', '❌ Başvurunuz Reddedildi', body, { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory }).catch(() => {});
            emitToUser(userId, 'notification', {});
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
                        // Offset alanları da gerekli — tenis/padel cezası skillRating'e değil
                        // ilgili disiplinin offset'ine yazılır (bkz. buildPenaltyUpdate).
                        select: { id: true, skillRating: true, singlesRatingOffset: true, doublesRatingOffset: true },
                    },
                },
            });
            const newCount = updatedUser.lateCancelCount;
            let penaltyApplied = false;
            if (newCount >= 4) {
                const interest = updatedUser.interests[0];
                if (interest) {
                    // Rival tarafındaki geç iptal/no-show cezalarıyla AYNI yol: doğrudan
                    // skillRating düşürmek tenis/padel'de hiçbir işe yaramıyordu — o dallarda
                    // görünen puan singlesRating/doublesRating + offset üzerinden okunuyor
                    // (getDisplayRating), skillRating ise sadece bir ayna ve bir sonraki maçın
                    // recompute'u onu zaten eziyor. Yani ceza sessizce kayboluyordu.
                    await prisma.userInterest.update({
                        where: { id: interest.id },
                        data: buildPenaltyUpdate(interest, tournament.subCategory, isDoublesFormat({ tournamentType: tournament.type }), 0.5),
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

        const nextEndDate = b.endDate !== undefined ? (b.endDate ? new Date(b.endDate) : null) : tournament.endDate;
        const nextEndTime = b.endTime !== undefined ? (b.endTime || null) : tournament.endTime;
        if (nextEndDate) {
            const ms = registrationDeadlineMs(nextEndDate, nextEndTime);
            if (ms != null && ms <= Date.now()) {
                return res.status(400).json({ message: 'Son başvuru tarih ve saati geçmiş olamaz.' });
            }
        }

        const nextEventDate = b.eventDate !== undefined ? (b.eventDate ? new Date(b.eventDate) : null) : tournament.eventDate;
        const nextEventTime = b.eventTime !== undefined ? (b.eventTime || null) : tournament.eventTime;
        if (nextEventDate && nextEventTime) {
            const ms = registrationDeadlineMs(nextEventDate, nextEventTime);
            if (ms != null && ms <= Date.now()) {
                return res.status(400).json({ message: 'Turnuva başlangıç tarih ve saati geçmiş olamaz.' });
            }
        }
        const nextEventEndDate = b.eventEndDate !== undefined ? (b.eventEndDate ? new Date(b.eventEndDate) : null) : tournament.eventEndDate;
        const nextEventEndTime = b.eventEndTime !== undefined ? (b.eventEndTime || null) : tournament.eventEndTime;
        if (nextEventEndDate && nextEventEndTime) {
            const ms = registrationDeadlineMs(nextEventEndDate, nextEventEndTime);
            if (ms != null && ms <= Date.now()) {
                return res.status(400).json({ message: 'Tahmini bitiş tarih ve saati geçmiş olamaz.' });
            }
        }

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
                ...(b.whatsappGroupUrl    !== undefined && { whatsappGroupUrl: sanitizeWhatsappGroupUrl(b.whatsappGroupUrl) }),
                ...(b.scope               !== undefined && { scope: b.scope }),
                ...(b.genderType          !== undefined && { genderType: b.genderType }),
                ...(b.location            !== undefined && { location: b.location || null }),
                ...(b.venueId             !== undefined && { venueId: b.venueId || null }),
                ...(b.venueCourtId        !== undefined && { venueCourtId: b.venueCourtId || null }),
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
                ...(b.setsPerMatch !== undefined && ![3, 5].includes(parseInt(b.setsPerMatch)) ? { decidingTiebreak: false } : {}),
                ...(b.decidingTiebreak !== undefined && isRacketSetSport(tournament.subCategory)
                    && [3, 5].includes(parseInt(b.setsPerMatch ?? tournament.setsPerMatch))
                    ? { decidingTiebreak: !!b.decidingTiebreak } : {}),
                ...(b.matchesBeforePlayoff !== undefined && { matchesBeforePlayoff: b.matchesBeforePlayoff ? parseInt(b.matchesBeforePlayoff) : null }),
                ...(b.playoffQualifiers   !== undefined && { playoffQualifiers: b.playoffQualifiers ? parseInt(b.playoffQualifiers) : null }),
                ...(b.eventDate    !== undefined && { eventDate:    b.eventDate ? new Date(b.eventDate) : null }),
                ...(b.eventTime    !== undefined && { eventTime:    b.eventTime || null }),
                ...(b.eventEndDate !== undefined && { eventEndDate: b.eventEndDate ? new Date(b.eventEndDate) : null }),
                ...(b.eventEndTime !== undefined && { eventEndTime: b.eventEndTime || null }),
                ...(b.endDate      !== undefined && { endDate:      b.endDate ? new Date(b.endDate) : null }),
                ...(b.endTime      !== undefined && { endTime:      b.endTime || null }),
                // Son başvuru uzatıldıysa yetersiz-oyuncu 24s uyarısını sıfırla
                ...((b.endDate !== undefined || b.endTime !== undefined) && {
                    underfillWarnedAt: null,
                }),
            },
        });
        // Liste/detay açık olan herkes anında görsün — yenilemeye gerek kalmasın.
        const notifyIds = new Set([updated.creatorId]);
        try {
            const parts = await prisma.tournamentParticipant.findMany({
                where: { tournamentId: id, status: { in: ['ACCEPTED', 'PENDING', 'WAITLIST'] } },
                select: { userId: true },
            });
            parts.forEach((p) => { if (p.userId) notifyIds.add(p.userId); });
        } catch { /* */ }
        const payload = { tournament: updated };
        notifyIds.forEach((uid) => {
            if (uid && uid !== req.userId) emitToUser(uid, 'tournament:updated', payload);
        });
        broadcast('tournament:updated', payload);
        res.json(updated);
    } catch (e) { next(e); }
};

export const deleteTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        // voidMatches=true → oynanan maçlar yok hükmünde, ELO geri alınır.
        // false/yok → maçlar ve ELO geçerli kalır; sadece turnuva kaydı silinir.
        const voidRaw = req.body?.voidMatches ?? req.query?.voidMatches;
        const voidMatches = voidRaw === true || voidRaw === 'true' || voidRaw === 1 || voidRaw === '1';

        const tournament = await prisma.tournament.findUnique({
            where: { id },
            include: { participants: { where: { status: 'ACCEPTED' }, select: { userId: true } } },
        });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId && !req.isAdmin) return res.status(403).json({ message: 'Not authorized' });

        let reversed = 0;
        if (voidMatches) {
            const scored = await prisma.tournamentMatch.findMany({
                where: { tournamentId: id, status: { in: ['COMPLETED', 'FORFEIT'] } },
            });
            for (const m of scored) {
                await reverseCompletedMatchElo(tournament, m);
                reversed += 1;
            }
        }

        await prisma.tournament.delete({ where: { id } });
        for (const p of tournament.participants) {
            if (p.userId && p.userId !== req.userId) {
                emitToUser(p.userId, 'tournament:deleted', { tournamentId: id, voidMatches });
            }
        }
        res.json({
            message: voidMatches
                ? 'Turnuva silindi; oynanan maçlar yok sayıldı ve ELO geri alındı.'
                : 'Turnuva silindi; oynanan maçlar ve ELO geçerli kaldı.',
            voidMatches,
            reversed,
        });
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
    if (isDefi(tournament)) return startDefiLadder(tournament, { actorUserId });
    const { id } = tournament;

    const rawParticipants = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: id, status: 'ACCEPTED' },
        include: {
            user: {
                select: {
                    id: true, username: true, fullName: true, gender: true,
                    interests: {
                        where: { category: tournament.category, subCategory: tournament.subCategory },
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

    const isDoublesTournament = isDoublesFormat({ tournamentType: tournament.type });
    const players = mainList.map(p => ({
        id: p.userId || p.id,
        fullName: p.userId ? (p.user?.fullName || null) : p.manualName,
        username: p.userId ? (p.user?.username || null) : p.manualName,
        alias: p.userId ? (p.user?.interests?.[0]?.alias || null) : null,
        skillRating: p.userId ? getDisplayRating(p.user?.interests?.[0], tournament.subCategory, isDoublesTournament) : 0,
    }));

    if (players.length < (tournament.minPlayers || 2)) {
        throw Object.assign(new Error(`En az ${tournament.minPlayers || 2} oyuncu gerekli`), { status: 400 });
    }

    // Müsaitliğe göre eşleştirme: format aynı kalır; kura yerine haftalık tur + admin onaylı eşleşme
    if (tournament.availabilityMatchEnabled) {
        if (isDefi(tournament)) {
            throw Object.assign(new Error('Defi liginde müsaitliğe göre eşleştirme kullanılamaz'), { status: 400 });
        }
        let sides;
        let excludedFromTeamsAvail = [];
        if (tournament.type === '2' || tournament.type === '4') {
            const { teamsData, excluded } = await formTeamsForTournament(
                tournament, rawParticipants, tournament.type === '4',
            );
            excludedFromTeamsAvail = excluded;
            if (teamsData.length < 2) {
                throw Object.assign(new Error('Çiftler turnuvası için en az 2 takım gerekli'), { status: 400 });
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
            sides = createdTeams.map(t => ({
                id: t.id,
                name: `${t.player1Name} & ${t.player2Name}`,
                skillRating: t.avgRating,
                memberUserIds: [t.player1Id, t.player2Id].filter(Boolean),
            }));
        } else if (tournament.type === '7') {
            // Americano: her tur geçici çift — side bireysel oyuncu; eşleşme motoru tur bazlı
            if (players.length < 4) {
                throw Object.assign(new Error('Americano için en az 4 oyuncu gerekli'), { status: 400 });
            }
            sides = players.filter(p => p.id).map(p => ({
                id: p.id,
                name: sportDisplayName(p, { alias: p.alias }),
                skillRating: p.skillRating || 0,
                memberUserIds: [p.id],
            }));
        } else {
            sides = players.filter(p => p.id).map(p => ({
                id: p.id,
                name: sportDisplayName(p, { alias: p.alias }),
                skillRating: p.skillRating || 0,
                memberUserIds: [p.id],
            }));
        }
        const { bootstrapAvailabilityRounds } = await import('./tournamentAvailability.controller.js');
        const result = await bootstrapAvailabilityRounds(tournament, { sides, actorUserId });
        // excluded bildirimleri zaten yukarıda; sonuç dön
        void excludedFromTeamsAvail;
        return result;
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
    } else if (tournament.type === '5') {
        // Swiss: round 1 puan/ELO ile; sonraki turlar skor sonrası dinamik.
        const round1Players = players.map(p => ({ ...p, points: 0, gamesWon: 0, gamesLost: 0, hadBye: false }));
        const pairing = pairSwissRound(round1Players, []);
        const deadline = new Date(baseDate);
        deadline.setDate(deadline.getDate() + 7);
        matches = swissMatchesFromPairing(id, 1, pairing, deadline);
        const totalRounds = swissRoundCount(players.length, tournament.matchesBeforePlayoff);
        await prisma.tournament.update({
            where: { id },
            data: { bracketData: { engine: 'swiss', totalRounds } },
        });
    } else if (tournament.type === '6') {
        // Çift eleme: kazananlar kurası + grand final iskeleti; kaybedenler dinamik.
        if (players.length < 4) {
            throw Object.assign(new Error('Çift eleme için en az 4 oyuncu gerekli.'), { status: 400 });
        }
        const built = buildWinnersBracket(players, id, 1);
        matches = built.matches;
        await prisma.tournament.update({
            where: { id },
            data: { bracketData: { engine: 'double_elim', wbRounds: built.wbRounds, size: built.size } },
        });
    } else if (tournament.type === '10') {
        // Saf tek eleme: grup yok — power-of-2 bracket (BYE ile doldurulur), phase=PLAYOFF.
        if (players.length < 2) {
            throw Object.assign(new Error('Eleme usulü için en az 2 oyuncu gerekli.'), { status: 400 });
        }
        matches = singleElimMatches(players, id, 1, 'PLAYOFF');
        const size = Math.pow(2, Math.ceil(Math.log2(Math.max(2, players.length))));
        const totalRounds = Math.log2(size);
        const baseDl = new Date(baseDate);
        baseDl.setDate(baseDl.getDate() + 7);
        matches = matches.map(m => (
            m.round === 1 && m.status === 'PENDING' && m.p1Id && m.p2Id
                ? { ...m, deadline: baseDl, readyAt: new Date() }
                : m
        ));
        await prisma.tournament.update({
            where: { id },
            data: { bracketData: { engine: 'single_elim', totalRounds, size } },
        });
    } else if (tournament.type === '7') {
        // Americano: bireysel kayıt, her tur geçici çiftler; min 4 oyuncu.
        if (players.length < 4) {
            throw Object.assign(new Error('Americano için en az 4 oyuncu gerekli.'), { status: 400 });
        }
        const totalRounds = americanoRoundCount(players.length, tournament.matchesBeforePlayoff);
        const { matches: roundMatches, history } = await createAmericanoRoundMatches(
            tournament, players, 1, { partners: [], opponents: [], sitOutLog: [] }, baseDate,
        );
        matches = roundMatches;
        await prisma.tournament.update({
            where: { id },
            data: { bracketData: { engine: 'americano', totalRounds, americano: history } },
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

    // type 5/6/7/10'da bracketData yukarıda yazıldıysa status güncellemesi createMany ile birleşsin —
    // tekrar overwrite etmemek için mevcut bracketData'yı koru.
    const existingBracket = tournament.type === '5' || tournament.type === '6' || tournament.type === '7' || tournament.type === '10'
        ? (await prisma.tournament.findUnique({ where: { id }, select: { bracketData: true } }))?.bracketData
        : tournament.bracketData;

    await prisma.$transaction([
        prisma.tournamentMatch.createMany({ data: matches }),
        prisma.tournament.update({
            where: { id },
            data: {
                status: 'IN_PROGRESS',
                startedAt: new Date(),
                ...(existingBracket ? { bracketData: existingBracket } : {}),
            },
        }),
    ]);

    // Auto-advance BYEs in round 1 (playoff / winners)
    const byeMatches = await prisma.tournamentMatch.findMany({
        where: { tournamentId: id, status: 'BYE', round: tournament.type === '2' ? 1 : undefined },
    });
    for (const bye of byeMatches) {
        if (bye.phase === 'PLAYOFF') {
            const slot = bye.matchIndex % 2 === 0 ? 'p1' : 'p2';
            const winnerName = bye.p1Id === bye.winnerId ? bye.p1Name : bye.p2Name;
            await prisma.tournamentMatch.updateMany({
                where: { tournamentId: id, round: bye.round + 1, matchIndex: Math.floor(bye.matchIndex / 2), phase: 'PLAYOFF' },
                data: slot === 'p1' ? { p1Id: bye.winnerId, p1Name: winnerName } : { p2Id: bye.winnerId, p2Name: winnerName },
            });
        } else if (bye.phase === 'WINNERS' && bye.winnerId) {
            const next = winnersNextSlot(bye);
            const winnerName = bye.p1Id === bye.winnerId ? bye.p1Name : (bye.p2Name || bye.p1Name);
            await prisma.tournamentMatch.updateMany({
                where: { tournamentId: id, phase: 'WINNERS', round: next.round, matchIndex: next.matchIndex },
                data: next.slot === 'p1'
                    ? { p1Id: bye.winnerId, p1Name: winnerName }
                    : { p2Id: bye.winnerId, p2Name: winnerName },
            });
            // Bye'da kaybeden yok — LB'ye düşmez
        }
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

    // Maç eşleşmeleri: her oyuncuya rakip adı + turnuva sahibine özet
    // (müsaitlik motorunda TOURNAMENT_STARTED yerine bu gider; klasik kurada ikisi de gider)
    try {
        const createdMatches = await prisma.tournamentMatch.findMany({
            where: {
                tournamentId: id,
                status: 'PENDING',
                p1Id: { not: null },
                p2Id: { not: null },
            },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
            take: 200,
        });
        // Sadece ilk tur / ilk maç seti — playoff iskeleti TBD'leri spam etmesin
        const firstRound = createdMatches.length
            ? Math.min(...createdMatches.map(m => m.round || 1))
            : 1;
        const pairingBatch = createdMatches.filter(m => (m.round || 1) === firstRound);
        await notifyTournamentMatchPairings({
            tournament: { ...tournament, id },
            matches: pairingBatch,
            roundIndex: firstRound,
            actorUserId,
            notifyOwner: true,
        });
        // TEST: demo_ botlara random müsaitlik/teklif — test bitince kaldırılacak
        await seedDemoSchedulesForMatches({ ...tournament, id }, createdMatches).catch(() => 0);
    } catch { /* non-critical */ }

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

/** Tamamlanmış turnuva maçının ELO/puan etkisini geri alır (yeniden eşleştirme / baştan başlatma). */
async function reverseCompletedMatchElo(tournament, match) {
    if (!match || (match.status !== 'COMPLETED' && match.status !== 'FORFEIT')) return;
    if (!match.score || !match.p1Id || !match.p2Id) return;
    const prev = typeof match.score === 'string' ? JSON.parse(match.score) : match.score;
    if (!prev || (prev.p1EloDelta === 0 && prev.p2EloDelta === 0 && !prev.p1RatingBefore && !prev.p2RatingBefore)) return;

    const isTeamTournament = isTeamEngineType(tournament.type);
    let p1Members = [match.p1Id].filter(Boolean);
    let p2Members = [match.p2Id].filter(Boolean);
    if (isTeamTournament) {
        const teams = await prisma.tournamentTeam.findMany({ where: { id: { in: [match.p1Id, match.p2Id].filter(Boolean) } } });
        const t1 = teams.find(t => t.id === match.p1Id);
        const t2 = teams.find(t => t.id === match.p2Id);
        if (t1) p1Members = [t1.player1Id, t1.player2Id].filter(Boolean);
        if (t2) p2Members = [t2.player1Id, t2.player2Id].filter(Boolean);
    }

    if (UTR_SUBCATEGORIES.includes(tournament.subCategory)) {
        try {
            await revertUtrMatchRecords({
                category: tournament.category,
                subCategory: tournament.subCategory,
                sourceType: 'TOURNAMENT',
                sourceId: match.id,
            });
        } catch { /* yoksa klasik geri alma */ }
    }

    const prevMemberBefore = (uid) => {
        const entry = [...(prev.p1MemberRatings || []), ...(prev.p2MemberRatings || [])].find(m => m.userId === uid);
        return entry?.before;
    };
    const memberIds = [...p1Members, ...p2Members];
    if (!memberIds.length) return;
    const prevInterests = await prisma.userInterest.findMany({
        where: { userId: { in: memberIds }, category: tournament.category, subCategory: tournament.subCategory },
    });
    for (const uid of p1Members) {
        const ir = prevInterests.find(i => i.userId === uid);
        if (!ir) continue;
        const delta = prev.p1EloDelta || 0;
        await prisma.userInterest.update({
            where: { id: ir.id },
            data: {
                totalPoints: Math.max(0, (ir.totalPoints || 0) - delta),
                wins:   { decrement: delta > 0 ? 1 : 0 },
                losses: { decrement: delta < 0 ? 1 : 0 },
                skillRating: prevMemberBefore(uid) ?? prev.p1RatingBefore ?? ir.skillRating,
            },
        });
    }
    for (const uid of p2Members) {
        const ir = prevInterests.find(i => i.userId === uid);
        if (!ir) continue;
        const delta = prev.p2EloDelta || 0;
        await prisma.userInterest.update({
            where: { id: ir.id },
            data: {
                totalPoints: Math.max(0, (ir.totalPoints || 0) - delta),
                wins:   { decrement: delta > 0 ? 1 : 0 },
                losses: { decrement: delta < 0 ? 1 : 0 },
                skillRating: prevMemberBefore(uid) ?? prev.p2RatingBefore ?? ir.skillRating,
            },
        });
    }
}

/**
 * Mevcut (son) GROUP turunu yeniden eşleştirir.
 * Bu turdaki tamamlanmış maçlar da silinir ve "oynanmamış" sayılır (ELO geri alınır).
 */
export const rematchTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });

        const isCreator = tournament.creatorId === req.userId;
        if (!isCreator) {
            const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
            if (!u?.isAdmin) return res.status(403).json({ message: 'Yetkiniz yok' });
        }
        if (tournament.status !== 'IN_PROGRESS') return res.status(400).json({ message: 'Turnuva devam etmekte değil' });
        if (['2', '3', '4', '5', '6', '7'].includes(String(tournament.type))) {
            return res.status(400).json({ message: 'Bu turnuva türünde mevcut tur yeniden eşleştirilemez' });
        }
        if (isDefi(tournament)) return res.status(400).json({ message: 'Defi liginde eşleşmeyi oyuncular teklifle kurar' });

        const allGroupMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id, phase: 'GROUP' },
        });
        if (allGroupMatches.length === 0) return res.status(400).json({ message: 'GROUP maç yok' });

        const maxRound = Math.max(...allGroupMatches.map(m => m.round || 1));
        const currentRoundMatches = allGroupMatches.filter(m => m.round === maxRound);
        const wipedCompleted = currentRoundMatches.filter(m => m.status === 'COMPLETED' || m.status === 'FORFEIT');

        for (const m of wipedCompleted) {
            await reverseCompletedMatchElo(tournament, m);
        }

        const sideIds = [...new Set(currentRoundMatches.flatMap(m => [m.p1Id, m.p2Id]).filter(Boolean))];

        await prisma.tournamentMatch.deleteMany({
            where: { tournamentId: id, phase: 'GROUP', round: maxRound },
        });

        let newMatches = [];
        const baseDate = tournamentBaseDate(tournament);
        const deadline = new Date(baseDate);
        deadline.setDate(deadline.getDate() + maxRound * 7);

        if (maxRound <= 1) {
            // 1. tur: bu turdaki (veya tüm kabul) oyuncularla sıfırdan ELO eşleşmesi
            let pool = [];
            if (sideIds.length) {
                pool = isTeamEngineType(tournament.type)
                    ? await getCurrentTeamRatings(tournament, sideIds)
                    : await getCurrentPlayerRatings(tournament, sideIds);
            }
            if (!pool.length) {
                const raw = await prisma.tournamentParticipant.findMany({
                    where: { tournamentId: id, status: 'ACCEPTED', userId: { not: null } },
                    include: {
                        user: {
                            select: {
                                id: true, fullName: true, username: true,
                                interests: { where: { category: tournament.category, subCategory: tournament.subCategory } },
                            },
                        },
                    },
                });
                pool = raw.map(p => ({
                    id: p.userId,
                    fullName: p.user?.fullName || null,
                    username: p.user?.username || null,
                    alias: p.user?.interests?.[0]?.alias || null,
                    skillRating: getDisplayRating(p.user?.interests?.[0], tournament.subCategory, false),
                }));
            }
            const pairs = pairByClosestElo(pool, []);
            newMatches = pairs.map((pair, idx) => ({
                tournamentId: id,
                round: 1,
                phase: 'GROUP',
                matchIndex: idx,
                p1Id: pair.p1.id,
                p1Name: sportDisplayName(pair.p1),
                p2Id: pair.p2.id,
                p2Name: sportDisplayName(pair.p2),
                status: 'PENDING',
                deadline,
            }));
        } else {
            const playedPairKeys = allGroupMatches
                .filter(m => m.round < maxRound && m.p1Id && m.p2Id)
                .map(m => [m.p1Id, m.p2Id].sort().join('|'));
            newMatches = await generateNextEloRound(tournament, maxRound, playedPairKeys);
        }

        if (!newMatches.length) return res.status(400).json({ message: 'Eşleşecek oyuncu bulunamadı' });
        await prisma.tournamentMatch.createMany({ data: newMatches });

        // Yeniden eşleştirme: oyuncular + sahip bildirimi
        try {
            const justCreated = await prisma.tournamentMatch.findMany({
                where: {
                    tournamentId: id,
                    phase: 'GROUP',
                    round: maxRound,
                    status: 'PENDING',
                    p1Id: { not: null },
                    p2Id: { not: null },
                },
                orderBy: { matchIndex: 'asc' },
            });
            await notifyTournamentMatchPairings({
                tournament,
                matches: justCreated,
                roundIndex: maxRound,
                actorUserId: req.userId,
                notifyOwner: true,
            });
            // TEST: demo_ botlara random müsaitlik/teklif
            await seedDemoSchedulesForMatches(tournament, justCreated).catch(() => 0);
        } catch { /* non-critical */ }

        const matches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });
        res.json({
            matches,
            rematchedRound: maxRound,
            wipedCompleted: wipedCompleted.length,
        });
    } catch (e) { next(e); }
};

/** Tip '1': prematüre tur 2+ sil + tur hazırsa güncel Elo ile sonraki turu kur (GET/joker tetikleri). */
async function tryHealAndAdvanceType1Elo(tournamentId) {
    const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
            participants: {
                where: { status: 'ACCEPTED' },
                include: { user: { select: { id: true, username: true, fullName: true } } },
            },
        },
    });
    if (!tournament || String(tournament.type) !== '1' || tournament.status !== 'IN_PROGRESS') {
        return false;
    }

    await healType1PendingFutureEloRounds(tournament);

    const allGroup = await prisma.tournamentMatch.findMany({
        where: { tournamentId, phase: 'GROUP' },
    });
    if (!allGroup.length) return false;

    const maxRound = Math.max(...allGroup.map(m => m.round));
    const current = allGroup.filter(m => m.round === maxRound);
    if (allGroup.some(m => m.round === maxRound + 1)) return false;

    const jokerUserIds = await loadJokerUserIds(tournamentId);
    if (!eloRoundReadyToAdvance(tournament, current, maxRound, jokerUserIds)) return false;

    // Sentetik "son tamamlanan" maç — advance'in match.round === maxRound dalına düşmesi için
    const seed = current.find(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.status === 'FORFEIT')
        || current[0];
    if (!seed) return false;
    await advanceTournamentAfterMatch(tournament, seed, false, false);
    return true;
}

export const getTournamentMatches = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({
            where: { id },
            select: {
                id: true, category: true, subCategory: true, type: true, location: true,
                status: true, availabilityMatchEnabled: true, bracketData: true,
                eventDate: true, eventTime: true, matchesBeforePlayoff: true,
            },
        });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        // Tip '1' Elo: tur 2 prematüre ise sil; tur 1 hazırsa güncel Elo ile otomatik kur
        try {
            if (String(tournament.type) === '1' && tournament.status === 'IN_PROGRESS') {
                await tryHealAndAdvanceType1Elo(id);
            }
        } catch { /* non-critical */ }

        const [matchesRaw, myTeams, teams] = await Promise.all([
            prisma.tournamentMatch.findMany({
                where: { tournamentId: id },
                orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
                include: { court: { select: { id: true, name: true, address: true } } },
            }),
            // Çiftler / Americano: maçlarda p1Id/p2Id takım id'sidir — Americano'da oyuncu
            // her tur farklı takımda olabilir, bu yüzden tüm takım id'lerini döndürürüz.
            prisma.tournamentTeam.findMany({
                where: { tournamentId: id, OR: [{ player1Id: req.userId }, { player2Id: req.userId }] },
                select: { id: true, player1Id: true, player2Id: true },
            }),
            prisma.tournamentTeam.findMany({
                where: { tournamentId: id },
                select: { id: true, player1Id: true, player1Name: true, player2Id: true, player2Name: true },
            }),
        ]);
        // TEST: mevcut eşleşmelerde boş kalan demo_ taraflarını doldur (playoff sonradan dolduysa vb.)
        try {
            await seedDemoSchedulesForMatches(tournament, matchesRaw);
            // İki taraf müsaitlik girdiyse ortak çakışmaları suggested'a yaz (eski maçlar dahil)
            await healMatchSuggestedOverlaps(tournament, matchesRaw);
        } catch { /* non-critical */ }
        const myTeam = myTeams[0] || null;
        const matches = await attachSanitizedSchedules(tournament, matchesRaw, req.userId);

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

        res.json({ matches, myTeamId: myTeam?.id || null, myTeamIds: myTeams.map(t => t.id), teams: teamsEnriched, playerRatings, myJokerUsed });
    } catch (e) { next(e); }
};

/** Shared by score entry (enterTournamentMatchScore) and the deadline auto-draw job
 *  (tournamentDeadlineReminder.js): after a GROUP-phase match resolves (win or
 *  auto-draw), generates the next dynamic round / playoff bracket once the current
 *  round is fully resolved, and auto-completes the tournament once no PENDING
 *  matches remain. `tournament` must include `participants` (status ACCEPTED). */

/** Çift eleme: WB/LB/GF ilerletme + kaybedeni LB'ye düşürme. */
async function advanceDoubleElimAfterScore(tournament, match, winnerId, loserId, winnerName, loserName) {
    const id = tournament.id;
    const meta = (tournament.bracketData && typeof tournament.bracketData === 'object') ? tournament.bracketData : {};
    const wbRounds = meta.wbRounds || Math.log2(meta.size || 2);

    const fillSlot = async (phase, round, matchIndex, slot, playerId, playerName) => {
        let row = await prisma.tournamentMatch.findFirst({
            where: { tournamentId: id, phase, round, matchIndex },
        });
        if (!row) {
            row = await prisma.tournamentMatch.create({
                data: {
                    tournamentId: id, phase, round, matchIndex, status: 'PENDING',
                    ...(slot === 'p1' ? { p1Id: playerId, p1Name: playerName } : { p2Id: playerId, p2Name: playerName }),
                },
            });
        } else {
            await prisma.tournamentMatch.update({
                where: { id: row.id },
                data: slot === 'p1' ? { p1Id: playerId, p1Name: playerName } : { p2Id: playerId, p2Name: playerName },
            });
            row = await prisma.tournamentMatch.findUnique({ where: { id: row.id } });
        }
        if (row?.p1Id && row?.p2Id && row.status === 'PENDING') {
            await markPlayoffMatchReadyDeadline(row.id);
        }
        return row;
    };

    const ensureGrandFinal = async (wbChampId, wbChampName, lbChampId, lbChampName) => {
        if (!wbChampId || !lbChampId) return;
        const existing = await prisma.tournamentMatch.findFirst({
            where: { tournamentId: id, phase: 'GRAND_FINAL', matchIndex: 0 },
        });
        if (existing) {
            await prisma.tournamentMatch.update({
                where: { id: existing.id },
                data: {
                    p1Id: wbChampId, p1Name: wbChampName,
                    p2Id: lbChampId, p2Name: lbChampName,
                    ...(existing.readyAt ? {} : { readyAt: new Date() }),
                },
            });
        } else {
            await prisma.tournamentMatch.create({
                data: {
                    tournamentId: id, phase: 'GRAND_FINAL', round: wbRounds + 1, matchIndex: 0,
                    p1Id: wbChampId, p1Name: wbChampName,
                    p2Id: lbChampId, p2Name: lbChampName,
                    status: 'PENDING', readyAt: new Date(),
                },
            });
        }
    };

    if (match.phase === 'WINNERS') {
        // Kazanan → sonraki WB (final değilse)
        if (match.round < wbRounds) {
            const next = winnersNextSlot(match);
            await fillSlot('WINNERS', next.round, next.matchIndex, next.slot, winnerId, winnerName);
        } else {
            // WB şampiyonu → GF p1; LB şampiyonu varsa GF aç
            const lbFinalRound = 2 * (wbRounds - 1);
            const lbFinal = await prisma.tournamentMatch.findFirst({
                where: {
                    tournamentId: id, phase: 'LOSERS', round: lbFinalRound,
                    status: { in: ['COMPLETED', 'BYE', 'FORFEIT'] },
                },
                orderBy: { matchIndex: 'asc' },
            });
            // LB final tek maç (matchIndex 0) beklenir
            const lbChamp = lbFinal?.winnerId
                ? { id: lbFinal.winnerId, name: lbFinal.winnerId === lbFinal.p1Id ? lbFinal.p1Name : lbFinal.p2Name }
                : null;
            await ensureGrandFinal(winnerId, winnerName, lbChamp?.id, lbChamp?.name);
            // LB henüz bitmediyse GF'yi WB şampiyonuyla yarım bırak (p1 dolu)
            if (!lbChamp) {
                const gf = await prisma.tournamentMatch.findFirst({ where: { tournamentId: id, phase: 'GRAND_FINAL' } });
                if (!gf) {
                    await prisma.tournamentMatch.create({
                        data: {
                            tournamentId: id, phase: 'GRAND_FINAL', round: wbRounds + 1, matchIndex: 0,
                            p1Id: winnerId, p1Name: winnerName, status: 'PENDING',
                        },
                    });
                } else if (!gf.p1Id) {
                    await prisma.tournamentMatch.update({
                        where: { id: gf.id },
                        data: { p1Id: winnerId, p1Name: winnerName },
                    });
                }
            }
        }

        // Kaybeden → LB (bye değilse)
        if (loserId) {
            const fromWbRound = match.round; // startRound=1 varsayımı
            const drop = losersDropTarget(fromWbRound, match.matchIndex, wbRounds);
            await fillSlot('LOSERS', drop.round, drop.matchIndex, drop.slot, loserId, loserName);
        }
    } else if (match.phase === 'LOSERS') {
        const next = losersNextSlot(match, wbRounds);
        if (next.phase === 'GRAND_FINAL') {
            const wbFinal = await prisma.tournamentMatch.findFirst({
                where: {
                    tournamentId: id, phase: 'WINNERS', round: wbRounds,
                    status: { in: ['COMPLETED', 'BYE', 'FORFEIT'] },
                },
            });
            const wbChampId = wbFinal?.winnerId;
            const wbChampName = wbFinal
                ? (wbFinal.winnerId === wbFinal.p1Id ? wbFinal.p1Name : wbFinal.p2Name)
                : null;
            await ensureGrandFinal(wbChampId, wbChampName, winnerId, winnerName);
            if (!wbChampId) {
                const gf = await prisma.tournamentMatch.findFirst({ where: { tournamentId: id, phase: 'GRAND_FINAL' } });
                if (!gf) {
                    await prisma.tournamentMatch.create({
                        data: {
                            tournamentId: id, phase: 'GRAND_FINAL', round: wbRounds + 1, matchIndex: 0,
                            p2Id: winnerId, p2Name: winnerName, status: 'PENDING',
                        },
                    });
                } else if (!gf.p2Id) {
                    await prisma.tournamentMatch.update({
                        where: { id: gf.id },
                        data: { p2Id: winnerId, p2Name: winnerName },
                    });
                }
            }
        } else {
            await fillSlot(next.phase, next.round, next.matchIndex, next.slot, winnerId, winnerName);
        }
    } else if (match.phase === 'GRAND_FINAL') {
        // Bracket reset: LB şampiyonu (p2) kazanırsa bir reset maçı (matchIndex 1)
        if (winnerId === match.p2Id) {
            const resetExists = await prisma.tournamentMatch.findFirst({
                where: { tournamentId: id, phase: 'GRAND_FINAL', matchIndex: 1 },
            });
            if (!resetExists) {
                await prisma.tournamentMatch.create({
                    data: {
                        tournamentId: id, phase: 'GRAND_FINAL', round: match.round, matchIndex: 1,
                        p1Id: match.p1Id, p1Name: match.p1Name,
                        p2Id: match.p2Id, p2Name: match.p2Name,
                        status: 'PENDING', readyAt: new Date(),
                    },
                });
            }
        }
        // WB şampiyonu (p1) kazandıysa veya reset oynandıysa PENDING kalmaz → auto-complete
    }
}

export async function advanceTournamentAfterMatch(tournament, match, isTeamTournament, isCorrection) {
    const id = tournament.id;

    // Bireysel Rekabetçi (type '1'), Çiftler Rekabetçi (type '2'), Antrenman (3/4),
    // Swiss (5) ve Americano (7): dinamik tur yönetimi.
    if (!isCorrection && (tournament.type === '1' || tournament.type === '2' || tournament.type === '3' || tournament.type === '4' || tournament.type === '5' || tournament.type === '7') && match.phase === 'GROUP') {
        // Tip '1': prematüre / eski-Elo tur 2+ (hepsi PENDING) varsa sil — aşağıda güncel Elo ile kurulur
        if (tournament.type === '1') {
            await healType1PendingFutureEloRounds(tournament);
        }

        const allGroupMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id, phase: 'GROUP' },
        });
        const currentRoundMatches = allGroupMatches.filter(m => m.round === match.round);
        const currentRoundDone = currentRoundMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.status === 'FORFEIT');

        // Tip '1': tur deadline'ının son gününü BEKLEMEZ.
        //  - 8/8 skor girildi (erkense de) → hemen yeni Elo ile sonraki tur
        //  - 7/8 bitti + 1 jokerli bekleyen → hemen: bitenler yeni Elo, joker tarafları o anki Elo
        const jokerUserIds = tournament.type === '1' ? await loadJokerUserIds(id) : null;
        const eloRoundReady = tournament.type === '1'
            && eloRoundReadyToAdvance(tournament, currentRoundMatches, match.round, jokerUserIds);

        const maxRound = allGroupMatches.length
            ? Math.max(...allGroupMatches.map(m => m.round))
            : match.round;
        // Joker gevşemesi sayesinde bir sonraki tur ZATEN kurulmuş olabilir (bu maç, o sırada
        // hâlâ PENDING kalan eski bir turun "sarkan" maçıydı — match.round burada maxRound'dan
        // KÜÇÜK olur). Böyle bir durumda bu maçın şimdi tamamlanması yeni bir tur ÜRETMEMELİ,
        // çünkü sonraki tur zaten var; sadece aşağıdaki "hiç PENDING kalmadı mı" (turnuva
        // otomatik tamamlama) kontrolüne düşmesi yeterli.
        const roundAdvanceOk = tournament.type === '1'
            ? eloRoundReady
            : currentRoundDone;
        if (roundAdvanceOk && match.round === maxRound) {
            const sideCount = isTeamTournament ? new Set(allGroupMatches.flatMap(m => [m.p1Id, m.p2Id]).filter(Boolean)).size : tournament.participants.length;
            // type '2'/'3'/'4': tüm turlar başta pre-generate; '5'/'7' dinamik (swiss/americano)
            const preGenerated = tournament.type === '2' || tournament.type === '3' || tournament.type === '4';
            const bracketMeta = (tournament.bracketData && typeof tournament.bracketData === 'object') ? tournament.bracketData : {};
            const matchesPerPlayer = tournament.type === '2'
                ? sideCount - 1
                : tournament.type === '5'
                    ? (bracketMeta.totalRounds || swissRoundCount(sideCount, tournament.matchesBeforePlayoff))
                    : tournament.type === '7'
                        ? (bracketMeta.totalRounds || americanoRoundCount(tournament.participants.length, tournament.matchesBeforePlayoff))
                        : (tournament.matchesBeforePlayoff || Math.min(sideCount - 1, 3));
            const existingPlayoff = await prisma.tournamentMatch.findFirst({
                where: { tournamentId: id, phase: 'PLAYOFF' },
            });
            const nextRoundAlreadyExists = allGroupMatches.some(m => m.round === maxRound + 1);
            const groupPhaseFullyDone = preGenerated
                ? allGroupMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.status === 'FORFEIT')
                : maxRound >= matchesPerPlayer;

            if (!preGenerated && maxRound < matchesPerPlayer && !existingPlayoff && !nextRoundAlreadyExists) {
                let nextCreated = [];
                if (tournament.type === '5') {
                    const playerIds = tournament.participants.map(p => p.userId).filter(Boolean);
                    const players = await getCurrentPlayerRatings(tournament, playerIds);
                    const nextRoundMatches = await generateNextSwissRound(tournament, players, maxRound + 1, allGroupMatches);
                    if (nextRoundMatches.length > 0) {
                        await prisma.tournamentMatch.createMany({ data: nextRoundMatches });
                        nextCreated = nextRoundMatches;
                    }
                } else if (tournament.type === '7') {
                    const playerIds = tournament.participants.map(p => p.userId).filter(Boolean);
                    const players = (await getCurrentPlayerRatings(tournament, playerIds)).filter(p => p.id);
                    const history = bracketMeta.americano || { partners: [], opponents: [], sitOutLog: [] };
                    const { matches: nextMatches, history: nextHistory } = await createAmericanoRoundMatches(
                        tournament, players, maxRound + 1, history, tournamentBaseDate(tournament),
                    );
                    if (nextMatches.length > 0) {
                        await prisma.tournamentMatch.createMany({ data: nextMatches });
                        await prisma.tournament.update({
                            where: { id },
                            data: { bracketData: { ...bracketMeta, americano: nextHistory } },
                        });
                        nextCreated = nextMatches;
                    }
                } else {
                    // Sonraki GROUP turunu güncel ELO ile oluştur (sadece type '1')
                    const playedPairKeys = allGroupMatches
                        .filter(m => m.p1Id && m.p2Id)
                        .map(m => [m.p1Id, m.p2Id].sort().join('|'));
                    const nextRoundMatches = await generateNextEloRound(tournament, maxRound + 1, playedPairKeys);
                    if (nextRoundMatches.length > 0) {
                        await prisma.tournamentMatch.createMany({ data: nextRoundMatches });
                        await linkEloRoundToAvailability(tournament, maxRound + 1);
                        nextCreated = nextRoundMatches;
                    }
                }
                if (nextCreated.length > 0) {
                    try {
                        const fresh = await prisma.tournamentMatch.findMany({
                            where: {
                                tournamentId: id,
                                phase: 'GROUP',
                                round: maxRound + 1,
                                status: 'PENDING',
                                p1Id: { not: null },
                                p2Id: { not: null },
                            },
                        });
                        await notifyTournamentMatchPairings({
                            tournament,
                            matches: fresh,
                            roundIndex: maxRound + 1,
                            notifyOwner: true,
                        });
                    } catch { /* non-critical */ }
                }
            } else if (currentRoundDone && groupPhaseFullyDone && !existingPlayoff && !nextRoundAlreadyExists) {
                // Swiss / Americano: play-off yok — turlar bitince turnuva tamamlanır (PENDING kalmazsa aşağıda).
                if (tournament.type === '5' || tournament.type === '7') {
                    // no-op: auto-complete bloğu PENDING=0 iken COMPLETED yapar
                } else {
                // Play-off'a geçiş joker gevşemesinden ETKİLENMEZ — son tur her zaman tam
                // bitmeyi bekler (eloRoundReady / joker erken açılışı değil, gerçek/tam bitiş).
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
                    compareStandingsCore(standings[qualifiers - 1], standings[qualifiers], tournament.type, allGroupMatches) === 0;

                let extraRoundMatches = [];
                if (boundaryTied) {
                    const playedPairKeys = allGroupMatches
                        .filter(m => m.p1Id && m.p2Id)
                        .map(m => [m.p1Id, m.p2Id].sort().join('|'));
                    extraRoundMatches = await generateNextEloRound(tournament, maxRound + 1, playedPairKeys);
                }

                if (boundaryTied && extraRoundMatches.length > 0) {
                    await prisma.tournamentMatch.createMany({ data: extraRoundMatches });
                    if (tournament.type === '1') {
                        await linkEloRoundToAvailability(tournament, maxRound + 1);
                    }

                    const tiedNames = standings
                        .filter(s => compareStandingsCore(s, standings[qualifiers - 1], tournament.type, allGroupMatches) === 0)
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
                    try {
                        const freshExtra = await prisma.tournamentMatch.findMany({
                            where: {
                                tournamentId: id,
                                phase: 'GROUP',
                                round: maxRound + 1,
                                status: 'PENDING',
                                p1Id: { not: null },
                                p2Id: { not: null },
                            },
                        });
                        await notifyTournamentMatchPairings({
                            tournament,
                            matches: freshExtra,
                            roundIndex: maxRound + 1,
                            notifyOwner: true,
                        });
                    } catch { /* non-critical */ }
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
                                        },
                                    },
                                },
                            },
                        });
                        return topParticipants.map(p => ({
                            id: p.userId,
                            fullName: p.user?.fullName || null,
                            username: p.user?.username || null,
                            skillRating: getDisplayRating(p.user?.interests?.[0], tournament.subCategory, false),
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
                } // end else (not swiss/americano)
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
            // Kullanıcı isteği: turnuva bitince devam edenler Arşiv'e sayfa yenilemeden/çık-gir
            // yapmadan anında geçsin — bkz. mobil SubCategoryScreen.js'teki onSocket('tournament:completed').
            emitToUser(p.userId, 'tournament:completed', { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory });
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

/**
 * Antreman eleme (tip 3/4): tüm GROUP turları başta bellidir. Oyuncu hâlâ önceki turda
 * PENDING maçı varken bir sonraki tur maçına skor girmek isterse — rakiple yer/zaman
 * konusunda karşılıklı anlaşmış olmalı (scheduleData.agreed). Aksi halde erken oynama yok.
 * Creator/admin bu kilitten muaf (süre dolunca skor girebilir).
 */
async function assertTrainingEarlyPlayAllowed(tournament, match, { isCreatorOrAdmin = false } = {}) {
    if (isCreatorOrAdmin) return;
    if (tournament.type !== '3' && tournament.type !== '4') return;
    if (match.phase !== 'GROUP' || !(match.round > 1) || !match.p1Id || !match.p2Id) return;

    const sideIds = [match.p1Id, match.p2Id];
    const earlierPending = await prisma.tournamentMatch.findFirst({
        where: {
            tournamentId: tournament.id,
            phase: 'GROUP',
            round: { lt: match.round },
            status: 'PENDING',
            OR: [
                { p1Id: { in: sideIds } },
                { p2Id: { in: sideIds } },
            ],
        },
        select: { id: true, round: true },
    });
    if (!earlierPending) return;

    const schedule = normalizeSchedule(match.scheduleData);
    if (schedule.agreed) return;

    const err = new Error(
        'Önceki tur bitmeden sonraki tur maçını oynamak için rakiple yer ve zaman konusunda anlaşmanız gerekir (maç kartından teklif → Anlaş).'
    );
    err.status = 400;
    throw err;
}

export const enterTournamentMatchScore = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        let { sets, winner } = req.body; // sets=[{p1:6,p2:3,tb1?,tb2?,matchTiebreak?},...], winner='p1'|'p2'

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
        const isTeamTournament = isTeamEngineType(tournament.type);
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
        const requester = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        const isAdminUser = !!requester?.isAdmin;
        if (!isCreator && !isPlayer && !isAdminUser) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Tip 3/4 antreman: önceki tur bitmeden sonraki tur skoruna karşılıklı anlaşma şart.
        try {
            await assertTrainingEarlyPlayAllowed(tournament, match, { isCreatorOrAdmin: isCreator || isAdminUser });
        } catch (gateErr) {
            if (gateErr?.status === 400) return res.status(400).json({ message: gateErr.message });
            throw gateErr;
        }

        if (isRacketSetSport(tournament.subCategory)) {
            const spm = tournament.setsPerMatch || 3;
            const deciding = !!tournament.decidingTiebreak && [2, 3, 5].includes(spm);
            const checked = normalizeRacketSets(sets, {
                decidingTiebreak: deciding,
                setsPerMatch: spm,
                a: 'p1', b: 'p2', tbA: 'tb1', tbB: 'tb2',
            });
            if (!checked.ok) return res.status(400).json({ message: checked.message });
            sets = checked.sets;
            winner = checked.winner === 'a' ? 'p1' : 'p2';
        }

        let p1Sets = 0, p2Sets = 0, p1Games = 0, p2Games = 0;
        for (const s of sets) {
            if (!s.matchTiebreak) { p1Games += s.p1 || 0; p2Games += s.p2 || 0; }
            if ((s.p1 || 0) > (s.p2 || 0)) p1Sets++; else if ((s.p2 || 0) > (s.p1 || 0)) p2Sets++;
        }
        const winnerId = winner === 'p1' ? match.p1Id : match.p2Id;
        const loserId  = winner === 'p1' ? match.p2Id : match.p1Id;
        const isCorrection = match.status === 'COMPLETED';

        // Onaylı skor kilidi: oyuncular düzenleyemez. Admin/oluşturucu adminOverride ile
        // doğrudan yazar; rakip acceptCorrection ile bekleyen düzeltmeyi uygular.
        const adminOverride = !!req.body?.adminOverride && (isCreator || isAdminUser);
        const acceptCorrection = !!req.body?.acceptCorrection;
        if (acceptCorrection) {
            const d = match.scoreDispute && typeof match.scoreDispute === 'object' ? match.scoreDispute : null;
            if (!d || d.status !== 'CORRECTION_PENDING') {
                return res.status(400).json({ message: 'Bekleyen bir skor düzeltmesi yok.' });
            }
            const proposerSide = d.bySide;
            const iAmProposerSide = (proposerSide === 'p1' && p1Members.includes(req.userId))
                || (proposerSide === 'p2' && p2Members.includes(req.userId));
            if (iAmProposerSide) {
                return res.status(403).json({ message: 'Düzeltmeyi yalnızca karşı taraf onaylayabilir.' });
            }
            if (!p1Members.includes(req.userId) && !p2Members.includes(req.userId)) {
                return res.status(403).json({ message: 'Bu maçta yer almıyorsunuz.' });
            }
        }
        if (isCorrection && match.p1Confirmed && match.p2Confirmed && !adminOverride && !acceptCorrection) {
            return res.status(400).json({ message: 'Skor her iki taraf tarafından onaylandı, artık düzenlenemez. İtiraz veya düzeltme isteği kullanın.' });
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

        if (UTR_SUBCATEGORIES.includes(tournament.subCategory)) {
            // Tenis/padel: UTR-esinli ayrı tekli/çiftler sistemi (bkz. utrRating.js). Skor
            // DÜZELTİLİYORSA (match zaten COMPLETED), bu maçın önceki katkısı
            // revertUtrMatchRecords ile TAMAMEN geri alınır: kayıtlar silinir, puan kalan
            // geçmişten yeniden hesaplanır, wins/losses/matchCount sayaçları düşürülür.
            // Puanın da geri alınması şart — yoksa düzeltme ilk skorla kirlenmiş puandan
            // hesaplıyor (bkz. o fonksiyonun yorumundaki simülasyon bulgusu).
            if (match.status === 'COMPLETED') {
                await revertUtrMatchRecords({
                    category: tournament.category, subCategory: tournament.subCategory,
                    sourceType: 'TOURNAMENT', sourceId: match.id,
                });
            }
            if (p1Members.length > 0 && p2Members.length > 0) {
                const winnerMembers = winner === 'p1' ? p1Members : p2Members;
                const loserMembers = winner === 'p1' ? p2Members : p1Members;
                const result = await applyUtrRatingForTournamentMatch({
                    category: tournament.category, subCategory: tournament.subCategory, tournamentType: tournament.type,
                    matchId: match.id, winnerMembers, loserMembers, sets, winnerSide: winner,
                });
                if (!result.skipRating) {
                    const byId = (uid) => result.changes.find(c => c.userId === uid);
                    const winnerChanges = winnerMembers.map(byId).filter(Boolean);
                    const loserChanges = loserMembers.map(byId).filter(Boolean);
                    const avg = (list, key) => list.length ? parseFloat((list.reduce((s, c) => s + c[key], 0) / list.length).toFixed(4)) : null;
                    const winnerMemberRatings = winnerChanges.map(c => ({ userId: c.userId, before: c.before, after: c.after }));
                    const loserMemberRatings = loserChanges.map(c => ({ userId: c.userId, before: c.before, after: c.after }));
                    p1MemberRatings = winner === 'p1' ? winnerMemberRatings : loserMemberRatings;
                    p2MemberRatings = winner === 'p2' ? winnerMemberRatings : loserMemberRatings;
                    p1RatingBefore = winner === 'p1' ? avg(winnerChanges, 'before') : avg(loserChanges, 'before');
                    p2RatingBefore = winner === 'p2' ? avg(winnerChanges, 'before') : avg(loserChanges, 'before');
                    p1RatingAfter = winner === 'p1' ? avg(winnerChanges, 'after') : avg(loserChanges, 'after');
                    p2RatingAfter = winner === 'p2' ? avg(winnerChanges, 'after') : avg(loserChanges, 'after');
                    p1EloDelta = winner === 'p1' ? avg(winnerChanges, 'change') : avg(loserChanges, 'change');
                    p2EloDelta = winner === 'p2' ? avg(winnerChanges, 'change') : avg(loserChanges, 'change');
                }
            }
        } else {
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
                    if (lg > wg) loserSets++;
                    if (s.matchTiebreak) continue;
                    winnerGames += wg; totalGames += (s.p1||0) + (s.p2||0);
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
        } // else (UTR_SUBCATEGORIES dışındaki dallar) sonu

        const score = { sets, winner, p1Sets, p2Sets, p1Games, p2Games, p1EloDelta, p2EloDelta, p1RatingBefore, p1RatingAfter, p2RatingBefore, p2RatingAfter, p1MemberRatings, p2MemberRatings };

        // Admin override / kabul edilen düzeltme: skor hemen kilitli kalır, açık itiraz temizlenir.
        const lockBothSides = adminOverride || acceptCorrection;

        await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: {
                score, status: 'COMPLETED', winnerId,
                scoreEnteredBy: req.userId,
                p1Confirmed: lockBothSides ? true : (enteredByP1 || p1AllDemo),
                p2Confirmed: lockBothSides ? true : (enteredByP2 || p2AllDemo),
                scoreSubmittedAt: new Date(),
                ...(lockBothSides ? { scoreDispute: Prisma.DbNull } : {}),
            },
        });

        // Advance winner through PLAYOFF / double-elim brackets
        if (tournament.type === '6' && ['WINNERS', 'LOSERS', 'GRAND_FINAL'].includes(match.phase)) {
            const wName = winner === 'p1' ? match.p1Name : match.p2Name;
            const lName = winner === 'p1' ? match.p2Name : match.p1Name;
            await advanceDoubleElimAfterScore(tournament, match, winnerId, loserId, wName, lName);
        } else if (match.phase === 'PLAYOFF' && !match.isThirdPlaceMatch) {
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

            // Kullanıcı isteği: her iki yarı final de bitince, kaybeden 2 taraf için 3.'lük
            // maçı "teklifi" (opsiyonel, kabul gerektiren bir slot) otomatik oluşturulur.
            // round = final'in round'u, matchIndex = 1 (final her zaman matchIndex 0 kullanır,
            // bu yüzden yukarıdaki round+1 kazanan-ilerletme sorgusuyla ASLA çakışmaz — final'den
            // sonra zaten bir round yok, o sorgu orada da hep boş döner).
            const nextRoundMatches = await prisma.tournamentMatch.findMany({
                where: { tournamentId: id, phase: 'PLAYOFF', round: match.round + 1 },
            });
            const isSemifinalRound = nextRoundMatches.length === 1 && !nextRoundMatches[0].isThirdPlaceMatch;
            if (isSemifinalRound) {
                const semifinalMatches = await prisma.tournamentMatch.findMany({
                    where: { tournamentId: id, phase: 'PLAYOFF', round: match.round, isThirdPlaceMatch: false },
                });
                const allSemisDone = semifinalMatches.length === 2 && semifinalMatches.every(m => m.status === 'COMPLETED');
                if (allSemisDone) {
                    const existingThirdPlace = await prisma.tournamentMatch.findFirst({
                        where: { tournamentId: id, phase: 'PLAYOFF', isThirdPlaceMatch: true },
                    });
                    if (!existingThirdPlace) {
                        const losers = semifinalMatches.map(m => ({
                            id: m.winnerId === m.p1Id ? m.p2Id : m.p1Id,
                            name: m.winnerId === m.p1Id ? m.p2Name : m.p1Name,
                        }));
                        if (losers[0].id && losers[1].id) {
                            // readyAt: 3.'lük maçının "hazır olduğu" an — kullanıcı isteği: taraflar
                            // 2 gün içinde kabul edip tarih belirlemezse (bkz. assignThirdPlaceMatchDate/
                            // resolveExpiredThirdPlaceMatches) 3./4. sıra averaja göre otomatik belirlenir.
                            // Bu alan genel PLAYOFF turlarındaki (3 gün + 7 gün = 10 gün) mekanizmayla
                            // KARIŞMASIN diye autoAssignPlayoffDeadlines sorgusu isThirdPlaceMatch:false
                            // filtresiyle bu satırları hariç tutuyor (bkz. o fonksiyon).
                            await prisma.tournamentMatch.create({
                                data: {
                                    tournamentId: id, phase: 'PLAYOFF', round: match.round + 1, matchIndex: 1,
                                    p1Id: losers[0].id, p1Name: losers[0].name,
                                    p2Id: losers[1].id, p2Name: losers[1].name,
                                    status: 'PENDING', isThirdPlaceMatch: true, readyAt: new Date(),
                                },
                            });
                            for (const l of losers) {
                                createNotification(l.id, 'THIRD_PLACE_MATCH_OFFER', "🥉 3.'lük Maçı Teklifi",
                                    `${tournament.name}: yarı finalde elendiniz ama 3.'lük maçı oynamak ister misiniz? Play-Off'lar sekmesinden kabul edip 2 gün içinde (en fazla 7 gün sonrasına) bir maç tarihi belirleyin — aksi halde 3./4. sıra yarı finaldeki averajınıza göre otomatik belirlenecek.`,
                                    { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory }
                                ).catch(() => {});
                            }
                        }
                    }
                }
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

/** Yarı final kaybedeni, otomatik oluşturulan 3.'lük maçı teklifine kabul/red verir
 *  (bkz. enterTournamentMatchScore — allSemisDone bloğu). İkisi de kabul edince maç normal
 *  bir PLAYOFF maçı gibi oynanabilir (Skor Gir); biri reddederse maç FORFEIT'e düşer ve
 *  3./4. sıra yarı final averajından belirlenir (bkz. mobil Play-Off'lar sekmesi).
 */
export const respondThirdPlaceMatch = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const { accept } = req.body; // boolean
        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id || !match.isThirdPlaceMatch) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (match.status !== 'PENDING') return res.status(400).json({ message: 'Bu maç için işlem yapılamaz' });
        const isP1 = match.p1Id === req.userId, isP2 = match.p2Id === req.userId;
        if (!isP1 && !isP2) return res.status(403).json({ message: 'Bu maçın tarafı değilsiniz' });

        let updated = await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: isP1 ? { p1ThirdPlaceAccepted: !!accept } : { p2ThirdPlaceAccepted: !!accept },
        });

        const tournament = await prisma.tournament.findUnique({
            where: { id },
            include: { participants: { where: { status: 'ACCEPTED' }, include: { user: { select: { id: true, username: true, fullName: true } } } } },
        });
        const otherId = isP1 ? match.p2Id : match.p1Id;

        if (accept === false) {
            // Biri reddettiyse maç asla oynanmayacak — PENDING kalırsa turnuvanın "bekleyen
            // maç kalmadı mı" otomatik tamamlanma kontrolünü (advanceTournamentAfterMatch)
            // sonsuza dek bloklardı. 3./4. sıra hemen averaja göre kayıt altına alınır (winnerId),
            // ardından advanceTournamentAfterMatch çağrılıp bu maç son bekleyense turnuva hemen
            // tamamlanıp arşive düşsün (kullanıcı raporu: "turnuvayı arşive almayı unutma").
            updated = await resolveThirdPlaceByAveraj(match);
            if (tournament) {
                const isTeamTournament = isTeamEngineType(tournament.type);
                await advanceTournamentAfterMatch(tournament, updated, isTeamTournament, false);
            }
            createNotification(otherId, 'THIRD_PLACE_MATCH_DECLINED', "🥉 3.'lük Maçı İptal",
                "Rakibiniz 3.'lük maçını oynamayı kabul etmedi — 3./4. sıra yarı final averajınıza göre belirlenecek.",
                { tournamentId: id, category: tournament?.category, subCategory: tournament?.subCategory }
            ).catch(() => {});
        } else if (updated.p1ThirdPlaceAccepted && updated.p2ThirdPlaceAccepted) {
            createNotification(otherId, 'THIRD_PLACE_MATCH_ACCEPTED', "🥉 3.'lük Maçı Onaylandı",
                "Rakibiniz de 3.'lük maçını kabul etti — şimdi ikinizden biri 2 gün içinde (en fazla 7 gün sonrasına) bir maç tarihi belirlemeli, aksi halde 3./4. sıra averaja göre otomatik belirlenecek.",
                { tournamentId: id, category: tournament?.category, subCategory: tournament?.subCategory }
            ).catch(() => {});
        }
        res.json(updated);
    } catch (e) { next(e); }
};

/** 3.'lük maçını kabul eden iki taraftan biri, maçın oynanacağı tarih/saati belirler —
 *  kullanıcı isteği: teklif "hazır" (readyAt) olduktan sonra 2 gün içinde belirlenmeli, seçilen
 *  tarih de yine readyAt'ten en fazla 7 gün sonrasına düşebilir (toplam en fazla 9 gün). Bu
 *  pencerelerden biri kaçırılırsa resolveExpiredThirdPlaceMatches (bkz. tournamentDeadlineReminder
 *  job'ı) devreye girip 3./4. sırayı averaja göre otomatik belirler. */
export const assignThirdPlaceMatchDate = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const { date, time } = req.body;
        if (!date) return res.status(400).json({ message: 'Tarih zorunludur' });

        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id || !match.isThirdPlaceMatch) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (match.status !== 'PENDING') return res.status(400).json({ message: 'Bu maç için işlem yapılamaz' });
        if (match.p1Id !== req.userId && match.p2Id !== req.userId) return res.status(403).json({ message: 'Bu maçın tarafı değilsiniz' });
        if (!match.p1ThirdPlaceAccepted || !match.p2ThirdPlaceAccepted) return res.status(400).json({ message: 'Önce her iki taraf da 3.\'lük maçını kabul etmeli' });
        if (!match.readyAt) return res.status(400).json({ message: 'Bu maç için henüz tarih ataması açık değil' });

        const twoDayLimit = new Date(match.readyAt.getTime() + 2 * 86400000);
        if (Date.now() > twoDayLimit.getTime()) return res.status(400).json({ message: '2 günlük tarih belirleme süresi doldu — 3./4. sıra averaja göre belirlenecek' });

        const deadline = buildDateTime(date, time);
        const sevenDayLimit = new Date(match.readyAt.getTime() + 7 * 86400000);
        if (!deadline || deadline.getTime() <= Date.now()) return res.status(400).json({ message: 'Geçmiş veya geçersiz bir tarih seçilemez' });
        if (deadline.getTime() > sevenDayLimit.getTime()) return res.status(400).json({ message: 'Maç tarihi en fazla 7 gün sonrasına ayarlanabilir' });

        const updated = await prisma.tournamentMatch.update({ where: { id: matchId }, data: { deadline } });

        const tournament = await prisma.tournament.findUnique({ where: { id }, select: { name: true, category: true, subCategory: true } });
        const otherId = match.p1Id === req.userId ? match.p2Id : match.p1Id;
        createNotification(otherId, 'THIRD_PLACE_MATCH_DATE_SET', "🥉 3.'lük Maçı Tarihi Belirlendi",
            `${tournament?.name}: rakibiniz 3.'lük maçı için ${new Date(deadline).toLocaleDateString('tr-TR')} tarihini belirledi.`,
            { tournamentId: id, category: tournament?.category, subCategory: tournament?.subCategory }
        ).catch(() => {});

        res.json(updated);
    } catch (e) { next(e); }
};

/** Tur penceresi (deadline) bitene kadar onaylı skora itiraz/düzeltme açık mı? */
function isTournamentScoreAppealOpen(match, tournament) {
    if (match?.deadline) return Date.now() <= new Date(match.deadline).getTime();
    if (tournament?.endDate) return Date.now() <= new Date(tournament.endDate).getTime();
    return tournament?.status === 'IN_PROGRESS';
}

async function resolveTournamentMatchSideMembers(tournament, match) {
    const isTeamTournament = isTeamEngineType(tournament.type);
    let p1Members = [match.p1Id].filter(Boolean);
    let p2Members = [match.p2Id].filter(Boolean);
    if (isTeamTournament) {
        const teams = await prisma.tournamentTeam.findMany({
            where: { id: { in: [match.p1Id, match.p2Id].filter(Boolean) } },
        });
        const t1 = teams.find(t => t.id === match.p1Id);
        const t2 = teams.find(t => t.id === match.p2Id);
        if (t1) p1Members = [t1.player1Id, t1.player2Id];
        if (t2) p2Members = [t2.player1Id, t2.player2Id];
    }
    return { isTeamTournament, p1Members, p2Members };
}

/** Oyuncu: onaylı skor için düzeltme isteği (rakip onayına gider). */
export const proposeTournamentScoreCorrection = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        let { sets, winner, note } = req.body || {};
        const trimmedNote = typeof note === 'string' ? note.trim() : '';
        if (!trimmedNote) return res.status(400).json({ message: 'Düzeltme için bir açıklama yazmalısınız.' });
        if (!Array.isArray(sets) || !sets.length) return res.status(400).json({ message: 'Yeni skor zorunludur.' });

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });

        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı.' });
        if (match.status !== 'COMPLETED' || !match.p1Confirmed || !match.p2Confirmed) {
            return res.status(400).json({ message: 'Yalnızca her iki tarafın onayladığı skorlar için düzeltme istenebilir.' });
        }
        if (!isTournamentScoreAppealOpen(match, tournament)) {
            return res.status(400).json({ message: 'Bu tur için itiraz / düzeltme süresi doldu.' });
        }
        const existing = match.scoreDispute && typeof match.scoreDispute === 'object' ? match.scoreDispute : null;
        if (existing?.status === 'CORRECTION_PENDING' || existing?.status === 'DISPUTE_PENDING') {
            return res.status(400).json({ message: 'Bu maç için zaten açık bir düzeltme veya itiraz var.' });
        }

        const { p1Members, p2Members } = await resolveTournamentMatchSideMembers(tournament, match);
        const isP1 = p1Members.includes(req.userId);
        const isP2 = p2Members.includes(req.userId);
        if (!isP1 && !isP2) return res.status(403).json({ message: 'Bu maçta yer almıyorsunuz.' });

        if (isRacketSetSport(tournament.subCategory)) {
            const spm = tournament.setsPerMatch || 3;
            const deciding = !!tournament.decidingTiebreak && [2, 3, 5].includes(spm);
            const checked = normalizeRacketSets(sets, {
                decidingTiebreak: deciding,
                setsPerMatch: spm,
                a: 'p1', b: 'p2', tbA: 'tb1', tbB: 'tb2',
            });
            if (!checked.ok) return res.status(400).json({ message: checked.message });
            sets = checked.sets;
            winner = checked.winner === 'a' ? 'p1' : 'p2';
        }
        if (winner !== 'p1' && winner !== 'p2') {
            return res.status(400).json({ message: 'Kazanan belirtilmeli.' });
        }

        const scoreDispute = {
            status: 'CORRECTION_PENDING',
            type: 'CORRECTION',
            byUserId: req.userId,
            bySide: isP1 ? 'p1' : 'p2',
            note: trimmedNote,
            proposedSets: sets,
            proposedWinner: winner,
            createdAt: new Date().toISOString(),
        };
        await prisma.tournamentMatch.update({ where: { id: matchId }, data: { scoreDispute } });

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
        const opponents = isP1 ? p2Members : p1Members;
        for (const uid of opponents) {
            createNotification(
                uid, 'SCORE_DISPUTED',
                '📝 Skor düzeltme isteği',
                `${me?.username || 'Rakip'} skor düzeltmesi istedi: ${trimmedNote}`,
                { tournamentId: id, matchId, scoreCorrection: true, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
            emitToUser(uid, 'tournament:match_scored', { tournamentId: id });
        }

        const allMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });
        res.json(allMatches);
    } catch (e) { next(e); }
};

/** Rakip: skor düzeltmesini onayla veya reddet. Onay → skor güncellenir; red → teklif sahibi admine itiraz edebilir. */
export const respondTournamentScoreCorrection = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const accept = !!req.body?.accept;
        const rejectNote = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });
        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı.' });

        const d = match.scoreDispute && typeof match.scoreDispute === 'object' ? match.scoreDispute : null;
        if (!d || d.status !== 'CORRECTION_PENDING') {
            return res.status(400).json({ message: 'Bekleyen bir skor düzeltmesi yok.' });
        }
        if (!isTournamentScoreAppealOpen(match, tournament)) {
            return res.status(400).json({ message: 'Bu tur için itiraz / düzeltme süresi doldu.' });
        }

        const { p1Members, p2Members } = await resolveTournamentMatchSideMembers(tournament, match);
        const isP1 = p1Members.includes(req.userId);
        const isP2 = p2Members.includes(req.userId);
        if (!isP1 && !isP2) return res.status(403).json({ message: 'Bu maçta yer almıyorsunuz.' });
        const iAmProposerSide = (d.bySide === 'p1' && isP1) || (d.bySide === 'p2' && isP2);
        if (iAmProposerSide) return res.status(403).json({ message: 'Düzeltmeyi yalnızca karşı taraf yanıtlayabilir.' });

        if (accept) {
            req.body = {
                sets: d.proposedSets,
                winner: d.proposedWinner,
                acceptCorrection: true,
            };
            return enterTournamentMatchScore(req, res, next);
        }

        const scoreDispute = {
            ...d,
            status: 'CORRECTION_REJECTED',
            rejectedAt: new Date().toISOString(),
            rejectedByUserId: req.userId,
            rejectNote: rejectNote || undefined,
        };
        await prisma.tournamentMatch.update({ where: { id: matchId }, data: { scoreDispute } });

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
        if (d.byUserId) {
            createNotification(
                d.byUserId, 'SCORE_DISPUTED',
                '❌ Skor düzeltmesi reddedildi',
                `${me?.username || 'Rakip'} düzeltme isteğinizi reddetti. Dilerseniz admine itiraz edebilirsiniz.`,
                { tournamentId: id, matchId, scoreCorrectionRejected: true, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
            emitToUser(d.byUserId, 'tournament:match_scored', { tournamentId: id });
        }

        const allMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });
        res.json(allMatches);
    } catch (e) { next(e); }
};

/** Oyuncu: onaylı skora veya reddedilen düzeltmeye admin itirazı. */
export const fileTournamentScoreDispute = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const trimmedNote = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
        if (!trimmedNote) return res.status(400).json({ message: 'İtiraz için bir açıklama yazmalısınız.' });

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });
        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı.' });
        if (match.status !== 'COMPLETED' || !match.p1Confirmed || !match.p2Confirmed) {
            return res.status(400).json({ message: 'Yalnızca onaylanmış skorlara itiraz edilebilir.' });
        }
        if (!isTournamentScoreAppealOpen(match, tournament)) {
            return res.status(400).json({ message: 'Bu tur için itiraz süresi doldu.' });
        }

        const existing = match.scoreDispute && typeof match.scoreDispute === 'object' ? match.scoreDispute : null;
        if (existing?.status === 'DISPUTE_PENDING' || existing?.status === 'CORRECTION_PENDING') {
            return res.status(400).json({ message: 'Bu maç için zaten açık bir itiraz veya düzeltme var.' });
        }

        const { p1Members, p2Members } = await resolveTournamentMatchSideMembers(tournament, match);
        const isP1 = p1Members.includes(req.userId);
        const isP2 = p2Members.includes(req.userId);
        if (!isP1 && !isP2) return res.status(403).json({ message: 'Bu maçta yer almıyorsunuz.' });

        const scoreDispute = {
            status: 'DISPUTE_PENDING',
            type: 'DISPUTE',
            byUserId: req.userId,
            bySide: isP1 ? 'p1' : 'p2',
            note: trimmedNote,
            createdAt: new Date().toISOString(),
            previous: existing || undefined,
        };
        await prisma.tournamentMatch.update({ where: { id: matchId }, data: { scoreDispute } });

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        const notifyIds = new Set([tournament.creatorId, ...admins.map(a => a.id)].filter(Boolean));
        for (const uid of notifyIds) {
            if (uid === req.userId) continue;
            createNotification(
                uid, 'SCORE_DISPUTED',
                '⚠️ Turnuva skor itirazı',
                `${me?.username || 'Oyuncu'} skor itirazı açtı: ${trimmedNote}`,
                { tournamentId: id, matchId, scoreDispute: true, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
            emitToUser(uid, 'notification', {});
        }

        const allMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });
        res.json(allMatches);
    } catch (e) { next(e); }
};

/** Skoru girmemiş taraf, kendi tarafından biri (Çiftler'de takım üyesi) olarak skoru
 *  onaylar. İki taraf da onaylayınca skor kilitlenir — oyuncular düzenleyemez; admin/oluşturucu
 *  adminOverride ile değiştirebilir, oyuncular tur bitene kadar itiraz/düzeltme kullanır.
 */
export const confirmTournamentMatchScore = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });

        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı.' });
        if (match.status !== 'COMPLETED') return res.status(400).json({ message: 'Bu maç için henüz skor girilmedi.' });

        const isTeamTournament = isTeamEngineType(tournament.type);
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
        if (!['1', '2', '3', '4', '10'].includes(tournament.type)) {
            return res.status(400).json({ message: 'Joker hakkı sadece Bireysel Rekabetçi, Çiftler Rekabetçi, Bireysel Antrenman, Çiftler Antrenman ve Eleme usulü turnuvalarda kullanılabilir.' });
        }
        if (tournament.dayTrip) {
            return res.status(400).json({ message: 'Günübirlik turnuvalarda joker hakkı bulunmaz — tüm maçlar aynı gün oynanır.' });
        }

        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı.' });
        if (match.status !== 'PENDING') return res.status(400).json({ message: 'Bu maç zaten tamamlanmış.' });

        // Çiftler Rekabetçi: p1Id/p2Id takım id'sidir — kendi tarafımın üyelerine çözülür.
        const isTeamTournament = isTeamEngineType(tournament.type);
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
        }

        // Tip '1': bu turdaki diğer maçlar bitmiş + kalanlar joker'liyse sonraki tur
        // o anki Elo ile hemen kurulsun (skor girişi beklemeden).
        if (tournament.type === '1' && match.phase === 'GROUP') {
            try {
                const fullTourn = await prisma.tournament.findUnique({
                    where: { id },
                    include: {
                        participants: {
                            where: { status: 'ACCEPTED' },
                            include: { user: { select: { id: true, username: true, fullName: true } } },
                        },
                    },
                });
                const freshMatch = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
                if (fullTourn && freshMatch) {
                    await advanceTournamentAfterMatch(fullTourn, freshMatch, isTeamTournament, false);
                }
            } catch { /* non-critical — joker kaydı zaten yazıldı */ }
        }

        const allMatches = await emitMatchUpdate();
        const updatedMatch = allMatches.find(m => m.id === matchId) || match;
        if (otherJokerRequested) {
            return res.json({
                mutual: true,
                message: `Karşılıklı ${isPlayoff ? 'ek süre' : 'joker'} onaylandı — süre +7 gün (tekrar eklenmedi), iki tarafın da hakkı tükenmedi.`,
                deadline: updatedMatch.deadline || match.deadline,
                matches: allMatches,
            });
        }
        return res.json({
            mutual: false,
            message: `${isPlayoff ? 'Ek süre hakkınız' : 'Joker hakkınız'} kullanıldı — deadline 7 gün uzatıldı.`,
            deadline: updatedMatch.deadline || newDeadline,
            matches: allMatches,
        });
    } catch (e) { next(e); }
};

async function withChatTables(fn) {
    try {
        return await fn();
    } catch (e) {
        if (!isMissingChatTable(e)) throw e;
        await ensureTournamentChatTables();
        return fn();
    }
}

// Turnuva grup sohbeti — sahip + ACCEPTED; OPEN iken son başvuruya kadar herkes (istek şart değil)
export const getTournamentChat = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({
            where: { id },
            select: { id: true, creatorId: true, status: true, endDate: true, endTime: true },
        });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });
        if (!(await userCanAccessTournamentChat(tournament, req.userId))) {
            return res.status(403).json({ message: 'Bu turnuvanın sohbetine erişiminiz yok.' });
        }

        const messages = await withChatTables(() => prisma.tournamentMessage.findMany({
            where: { tournamentId: id },
            include: { sender: { select: { id: true, username: true, fullName: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
            take: 200,
        }));
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
            include: { participants: { select: { userId: true, status: true } } },
        });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });
        if (!(await userCanAccessTournamentChat(tournament, req.userId))) {
            return res.status(403).json({ message: 'Bu turnuvanın sohbetine erişiminiz yok.' });
        }

        const message = await withChatTables(() => prisma.tournamentMessage.create({
            data: { tournamentId: id, senderId: req.userId, content: content.trim().slice(0, 1000) },
            include: { sender: { select: { id: true, username: true, fullName: true, avatar: true } } },
        }));

        // OPEN kayıt penceresinde: kurucu + tüm başvuranlar + daha önce yazanlar (anlık güncelleme)
        const openWindow = isOpenRegistrationChatWindow(tournament);
        const acceptedIds = tournament.participants.filter(p => p.status === 'ACCEPTED').map(p => p.userId).filter(Boolean);
        const allPartIds = tournament.participants.map(p => p.userId).filter(Boolean);
        const recipientIds = new Set([tournament.creatorId, ...(openWindow ? allPartIds : acceptedIds)]);
        if (openWindow) {
            try {
                const prior = await withChatTables(() => prisma.tournamentMessage.findMany({
                    where: { tournamentId: id },
                    select: { senderId: true },
                    distinct: ['senderId'],
                }));
                for (const row of prior) {
                    if (row?.senderId) recipientIds.add(row.senderId);
                }
            } catch { /* tablo yoksa sadece katılımcılara */ }
        }
        recipientIds.delete(req.userId);
        for (const uid of recipientIds) {
            emitToUser(uid, 'tournament:chat_message', { tournamentId: id, message });
        }

        // @username veya bu daldaki spor alias etiketleri — sessize alınmış olsa bile etiketlenene özel bildirim gider.
        const mentionTags = [...new Set(
            [...String(message.content).matchAll(/@([\p{L}\p{N}._]+)/gu)].map(m => m[1].toLowerCase()),
        )];
        let mentionedIds = new Set();
        if (mentionTags.length > 0) {
            const mentionUsers = await prisma.user.findMany({
                where: {
                    id: { in: [...recipientIds] },
                    OR: [
                        ...mentionTags.map(u => ({ username: { equals: u, mode: 'insensitive' } })),
                        {
                            interests: {
                                some: {
                                    subCategory: tournament.subCategory,
                                    ...(tournament.category ? { category: tournament.category } : {}),
                                    OR: mentionTags.map(u => ({ alias: { equals: u, mode: 'insensitive' } })),
                                },
                            },
                        },
                    ],
                },
                select: { id: true },
            });
            mentionedIds = new Set(mentionUsers.map(u => u.id));
        }

        // Katılımı onaylanmış herkese (ve oluşturana) bildirim gider. Zili kapatan sessize alınır;
        // ama @etiketlenen kullanıcı her zaman bildirilir.
        if (recipientIds.size > 0) {
            let muted = new Set();
            try {
                const rows = await prisma.tournamentChatNotify.findMany({
                    where: { tournamentId: id, userId: { in: [...recipientIds] }, enabled: false },
                    select: { userId: true },
                });
                muted = new Set(rows.map(r => r.userId));
            } catch { /* tercih tablosu yoksa herkese bildir */ }
            const senderInterest = await prisma.userInterest.findFirst({
                where: { userId: req.userId, subCategory: tournament.subCategory },
                select: { alias: true },
            });
            const senderName = sportDisplayName(
                { ...message.sender, alias: senderInterest?.alias },
                senderInterest,
            );
            for (const userId of recipientIds) {
                const isMentioned = mentionedIds.has(userId);
                if (!isMentioned && muted.has(userId)) continue;
                createNotification(
                    userId,
                    isMentioned ? 'TOURNAMENT_CHAT_MENTION' : 'TOURNAMENT_CHAT_MESSAGE',
                    isMentioned ? `📣 ${tournament.name}` : `💬 ${tournament.name}`,
                    isMentioned
                        ? `${senderName} seni etiketledi: ${message.content}`
                        : `${senderName}: ${message.content}`,
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
        const pref = await withChatTables(() => prisma.tournamentChatNotify.findFirst({
            where: { tournamentId: id, userId: req.userId },
            select: { enabled: true },
        }));
        // Kayıt yoksa bildirim açık kabul edilir.
        res.json({ enabled: pref ? !!pref.enabled : true });
    } catch (e) { next(e); }
};

export const setChatNotifyPref = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (typeof req.body?.enabled !== 'boolean') {
            return res.status(400).json({ message: 'Bildirim tercihi geçersiz.' });
        }
        const tournament = await prisma.tournament.findUnique({
            where: { id },
            select: { id: true, creatorId: true, status: true, endDate: true, endTime: true },
        });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });
        if (!(await userCanAccessTournamentChat(tournament, req.userId))) {
            return res.status(403).json({ message: 'Bu turnuvanın sohbetine erişiminiz yok.' });
        }
        const enabled = req.body.enabled;
        const existing = await withChatTables(() => prisma.tournamentChatNotify.findFirst({
            where: { tournamentId: id, userId: req.userId },
            select: { id: true },
        }));
        const pref = existing
            ? await prisma.tournamentChatNotify.update({ where: { id: existing.id }, data: { enabled } })
            : await prisma.tournamentChatNotify.create({ data: { tournamentId: id, userId: req.userId, enabled } });
        res.json({ enabled: pref.enabled });
    } catch (e) { next(e); }
};

export const getArchivedTournaments = async (req, res, next) => {
    try {
        const { category, subCategory, city, district, dateFrom, dateTo, participantId } = req.query;
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
            ...(district && { location: { contains: district, mode: 'insensitive' } }),
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
                _count:       { select: { participants: { where: { status: 'ACCEPTED' } }, messages: true } },
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

// coach.controller.js'deki COACH_APPROVAL_SPORTS ile aynı liste — admin onayı gerektiren
// dallarda (bkz. resolveRefereeEligibility ile aynı desen) onaylı bir antrenörlük ilanı olan
// kullanıcılar zaten ciddiyeti kanıtlanmış sayılır, turnuva oluşturma iznini otomatik alır.
const COACH_APPROVAL_SPORTS = ['volleyball', 'tennis', 'padel', 'pickleball'];

export const getTournamentPermissionStatus = async (req, res, next) => {
    try {
        const now = new Date();
        const sub = await prisma.businessSubscription.findFirst({
            where: { userId: req.userId, status: 'ACTIVE', endDate: { gt: now } },
            select: { packageType: true, endDate: true },
        });
        if (sub) return res.json({ status: 'APPROVED', subscription: sub, reason: 'subscription' });

        // Kullanıcı isteği: onaylı antrenörlerin turnuva oluşturma hakkı otomatik olsun —
        // admin'e ayrıca başvurmalarına gerek kalmadan doğrudan APPROVED dönülür.
        const approvedCoachListing = await prisma.coachListing.findFirst({
            where: { userId: req.userId, subCategory: { in: COACH_APPROVAL_SPORTS }, status: 'ACTIVE', approved: true },
            select: { id: true },
        });
        if (approvedCoachListing) return res.json({ status: 'APPROVED', subscription: null, reason: 'coach' });

        // Kullanıcı isteği: normal admin onayı akışı — daha önce bu fonksiyon
        // TournamentPermissionRequest'i hiç okumuyordu, bu yüzden admin PENDING bir başvuruyu
        // onaylasa/reddetse bile kullanıcı ekranında hep 'NONE' görünüyordu.
        const request = await prisma.tournamentPermissionRequest.findUnique({
            where: { userId: req.userId },
            select: { status: true },
        });
        res.json({ status: request?.status || 'NONE', subscription: null, reason: 'request' });
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

/** Turnuva sahibi / admin: bir turun (ve aynı fazdaki sonraki turların) deadline'ını
 *  N gün uzatır — hava koşulları vb. için. Sonraki turlar da aynı miktarda kayar. */
export const extendRoundDeadline = async (req, res, next) => {
    try {
        const { id } = req.params;
        const phase = String(req.body.phase || 'GROUP');
        const round = parseInt(req.body.round, 10);
        const days = parseInt(req.body.days, 10);
        if (!Number.isFinite(round) || round < 1) return res.status(400).json({ message: 'Geçerli tur gerekli' });
        if (!Number.isFinite(days) || days < 1 || days > 60) return res.status(400).json({ message: '1–60 arası gün sayısı gerekli' });

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        if (tournament.dayTrip) return res.status(400).json({ message: 'Günübirlik turnuvalarda süre uzatma yok' });

        const isCreator = tournament.creatorId === req.userId;
        if (!isCreator) {
            const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
            if (!u?.isAdmin) return res.status(403).json({ message: 'Yalnızca turnuva sahibi veya admin süre uzatabilir' });
        }

        const toShift = await prisma.tournamentMatch.findMany({
            where: {
                tournamentId: id,
                phase,
                round: { gte: round },
                deadline: { not: null },
            },
            select: { id: true, deadline: true, round: true },
        });
        if (toShift.length === 0) return res.status(400).json({ message: 'Bu tur için uzatılacak deadline bulunamadı' });

        const ms = days * 86400000;
        await Promise.all(toShift.map(m => prisma.tournamentMatch.update({
            where: { id: m.id },
            data: { deadline: new Date(new Date(m.deadline).getTime() + ms) },
        })));

        const allMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });

        // Katılımcılara kısa bildirim — maç listesi socket ile tazelensin
        const parts = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id, status: 'ACCEPTED', userId: { not: null } },
            select: { userId: true },
        });
        const notifyIds = new Set([tournament.creatorId, ...parts.map(p => p.userId)].filter(Boolean));
        for (const uid of notifyIds) {
            emitToUser(uid, 'tournament:match_scored', { tournamentId: id, matches: allMatches });
        }
        if (tournament.creatorId && tournament.creatorId !== req.userId) {
            createNotification(
                tournament.creatorId,
                'TOURNAMENT_ROUND_EXTENDED',
                '📅 Tur süresi uzatıldı',
                `${tournament.name}: ${phase} Tur ${round} ve sonrası +${days} gün uzatıldı.`,
                { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
        }

        res.json(allMatches);
    } catch (e) { next(e); }
};

/** Turnuva sahibi / admin: tek bir maçın deadline'ını N gün uzatır (diğer maçlara dokunmaz). */
export const extendMatchDeadline = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const days = parseInt(req.body.days, 10);
        if (!Number.isFinite(days) || days < 1 || days > 60) return res.status(400).json({ message: '1–60 arası gün sayısı gerekli' });

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        if (tournament.dayTrip) return res.status(400).json({ message: 'Günübirlik turnuvalarda süre uzatma yok' });

        const isCreator = tournament.creatorId === req.userId;
        if (!isCreator) {
            const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
            if (!u?.isAdmin) return res.status(403).json({ message: 'Yalnızca turnuva sahibi veya admin süre uzatabilir' });
        }

        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (match.status !== 'PENDING') return res.status(400).json({ message: 'Sadece bekleyen maçlar uzatılabilir' });
        if (!match.deadline) return res.status(400).json({ message: 'Bu maçta henüz bitiş tarihi yok' });

        const newDeadline = new Date(new Date(match.deadline).getTime() + days * 86400000);
        await prisma.tournamentMatch.update({ where: { id: matchId }, data: { deadline: newDeadline } });

        const allMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });

        const sideIds = [match.p1Id, match.p2Id].filter(Boolean);
        const notifyIds = new Set([tournament.creatorId, ...sideIds]);
        // Takım turnuvalarında p1Id/p2Id team id olabilir — üyeleri de bilgilendir
        if (sideIds.length) {
            const teams = await prisma.tournamentTeam.findMany({ where: { id: { in: sideIds } } }).catch(() => []);
            for (const t of teams) {
                if (t.player1Id) notifyIds.add(t.player1Id);
                if (t.player2Id) notifyIds.add(t.player2Id);
            }
        }
        for (const uid of notifyIds) {
            if (!uid) continue;
            emitToUser(uid, 'tournament:match_scored', { tournamentId: id, matches: allMatches });
        }

        res.json(allMatches);
    } catch (e) { next(e); }
};

function buildDateTime(date, time) {
    if (!date) return null;
    const d = new Date(date).toISOString().split('T')[0];
    const t = time || '00:00';
    return new Date(`${d}T${t}:00+03:00`);
}

function emptySchedule() {
    return {
        availability: { p1: [], p2: [] },
        preferredCourts: { p1: [], p2: [] },
        proposals: [],
        agreed: null,
        suggested: null,
    };
}

function sanitizePreferredCourts(list) {
    if (!Array.isArray(list)) return [];
    return list
        .filter(c => c && (c.name || c.venueId || c.courtId))
        .map(c => ({
            courtId: c.courtId || null,
            venueId: c.venueId || null,
            venueCourtId: c.venueCourtId || null,
            name: String(c.name || '').trim().slice(0, 120) || null,
            city: c.city ? String(c.city).slice(0, 80) : null,
            isProVenue: c.isProVenue === true,
        }))
        .filter(c => c.name || c.venueId || c.courtId)
        .slice(0, 10);
}

function normalizeSchedule(raw) {
    const base = emptySchedule();
    if (!raw || typeof raw !== 'object') return base;
    return {
        availability: {
            p1: Array.isArray(raw.availability?.p1) ? raw.availability.p1 : [],
            p2: Array.isArray(raw.availability?.p2) ? raw.availability.p2 : [],
        },
        preferredCourts: {
            p1: sanitizePreferredCourts(raw.preferredCourts?.p1),
            p2: sanitizePreferredCourts(raw.preferredCourts?.p2),
        },
        proposals: Array.isArray(raw.proposals) ? raw.proposals : [],
        agreed: raw.agreed && typeof raw.agreed === 'object' ? raw.agreed : null,
        // Ortak kort + ortak saat penceresi (belirli kort yok + müsaitlik eşleştirme)
        suggested: raw.suggested && typeof raw.suggested === 'object' ? raw.suggested : null,
    };
}

/** Kullanıcı bu maçın p1/p2 tarafında mı? (bireysel veya takım üyesi) */
async function resolveUserMatchSide(tournament, match, userId) {
    if (!userId || !match) return null;
    const isTeamEngine = tournament.type === '2' || tournament.type === '4' || tournament.type === '7';
    if (!isTeamEngine) {
        if (match.p1Id === userId) return 'p1';
        if (match.p2Id === userId) return 'p2';
        return null;
    }
    const teams = await prisma.tournamentTeam.findMany({
        where: { tournamentId: tournament.id, OR: [{ player1Id: userId }, { player2Id: userId }] },
        select: { id: true },
    });
    const ids = new Set(teams.map(t => t.id));
    if (ids.has(match.p1Id)) return 'p1';
    if (ids.has(match.p2Id)) return 'p2';
    return null;
}

function isDemoUsername(u) {
    return !!(u?.isDemoUser || (typeof u?.username === 'string' && u.username.startsWith('demo_')));
}

/**
 * TEST: maçın p1/p2 tarafı tamamen demo ise kabul/onay için kullanılacak bir demo userId döner.
 * Test bitince çağrıları kaldırmak yeterli.
 */
async function getDemoActorForMatchSide(tournament, match, sideKey) {
    const sideId = sideKey === 'p1' ? match?.p1Id : match?.p2Id;
    if (!sideId) return null;
    const isTeamEngine = tournament?.type === '2' || tournament?.type === '4' || tournament?.type === '7';
    if (!isTeamEngine) {
        const u = await prisma.user.findUnique({
            where: { id: sideId },
            select: { id: true, username: true, isDemoUser: true },
        });
        return isDemoUsername(u) ? { id: u.id } : null;
    }
    const team = await prisma.tournamentTeam.findUnique({
        where: { id: sideId },
        select: { player1Id: true, player2Id: true },
    });
    if (!team) return null;
    const memberIds = [team.player1Id, team.player2Id].filter(Boolean);
    if (!memberIds.length) return null;
    const members = await prisma.user.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, username: true, isDemoUser: true },
    });
    if (!members.length || members.length !== memberIds.length) return null;
    if (!members.every(isDemoUsername)) return null;
    return { id: members[0].id };
}

/**
 * TEST: rakip taraf demo ise teklifi onun adına kabul eder (HOLD varsa kesinleştirir).
 */
export async function tryDemoAutoAgreeSchedule(tournament, match, proposalId) {
    if (!tournament?.id || !match?.id || !proposalId) return null;
    if (match.status !== 'PENDING' || !match.p1Id || !match.p2Id) return null;
    const schedule = normalizeSchedule(match.scheduleData);
    if (schedule.agreed) return null;
    const proposal = (schedule.proposals || []).find(p => p.id === proposalId);
    if (!proposal?.side) return null;
    const otherSide = proposal.side === 'p1' ? 'p2' : 'p1';
    const demoActor = await getDemoActorForMatchSide(tournament, match, otherSide);
    if (!demoActor) return null;
    const { invokeControllerAs } = await import('../utils/internalInvoke.js');
    const result = await invokeControllerAs(agreeMatchSchedule, {
        userId: demoActor.id,
        params: { id: tournament.id, matchId: match.id },
        body: { proposalId },
    });
    if (result.status >= 400) {
        console.error('[demoBot] auto-agree schedule rejected:', result.status, result.body?.message, match.id);
        return null;
    }
    return result.body;
}

function sanitizeScheduleForViewer(scheduleData, isMatchParticipant) {
    const s = normalizeSchedule(scheduleData);
    // Eşleşme kartında herkes hangi tarafın müsaitlik / teklif bildirdiğini görsün
    // (önceden sadece katılımcıya açılıyordu; kartta "kim ne bildirdi" boş kalıyordu).
    if (isMatchParticipant) return s;
    if (!s.agreed && !s.suggested
        && !(s.availability.p1?.length || s.availability.p2?.length)
        && !(s.proposals?.length)
        && !(s.preferredCourts.p1?.length || s.preferredCourts.p2?.length)) {
        return null;
    }
    return s;
}

const DEMO_AVAIL_WINDOWS = [
    ['09:00', '12:00'], ['10:00', '13:00'], ['14:00', '17:00'],
    ['16:00', '19:00'], ['18:00', '21:00'],
];

function pickRandomDemo(arr, n) {
    const copy = [...arr];
    const out = [];
    while (out.length < n && copy.length) {
        out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
}

function randomDemoSlots() {
    const days = pickRandomDemo([1, 2, 3, 4, 5, 6, 7], 2 + Math.floor(Math.random() * 3));
    return days.map((weekday) => {
        const [timeFrom, timeTo] = DEMO_AVAIL_WINDOWS[Math.floor(Math.random() * DEMO_AVAIL_WINDOWS.length)];
        return { weekday, timeFrom, timeTo };
    });
}

function randomDemoProposal(side, byUserId, venueName, registeredCourt = null) {
    const d = new Date();
    d.setDate(d.getDate() + 1 + Math.floor(Math.random() * 6));
    const [timeFrom, timeTo] = DEMO_AVAIL_WINDOWS[Math.floor(Math.random() * DEMO_AVAIL_WINDOWS.length)];
    const c = registeredCourt && typeof registeredCourt === 'object' ? registeredCourt : null;
    return {
        id: crypto.randomUUID(),
        side,
        byUserId,
        venueName: c?.name || venueName || 'Kayıtlı Tesis',
        courtId: c?.courtId || null,
        venueId: c?.venueId || null,
        venueCourtId: c?.venueCourtId || null,
        isProVenue: c?.isProVenue === true,
        date: d.toISOString().slice(0, 10),
        timeFrom,
        timeTo,
        createdAt: new Date().toISOString(),
    };
}

function isFakeDemoCourtName(name) {
    const n = String(name || '').trim();
    if (!n) return false;
    return /^demo(\s|$)/i.test(n) || /demo\s+kort/i.test(n) || /^demo\s+ortak/i.test(n);
}

function preferredCourtsNeedRealSeed(list) {
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) return true;
    return arr.every(c => !c?.venueId && !c?.courtId && isFakeDemoCourtName(c?.name));
}

/** Sisteme kayıtlı onaylı tesisler (Pro+ öncelikli) + doğrulanmış topluluk kortları */
async function loadRegisteredCourtsForDemo(tournament) {
    const sport = tournament?.subCategory || null;
    const city = tournament?.city || null;
    const venueSelect = {
        id: true, name: true, city: true, userId: true, branch: true,
        courts: { select: { id: true, name: true }, take: 5 },
    };
    let venues = await prisma.businessVenue.findMany({
        where: {
            status: 'APPROVED',
            ...(sport ? { branch: sport } : {}),
            ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
        },
        select: venueSelect,
        take: 60,
        orderBy: { createdAt: 'desc' },
    });
    if (!venues.length && (sport || city)) {
        venues = await prisma.businessVenue.findMany({
            where: { status: 'APPROVED', ...(sport ? { branch: sport } : {}) },
            select: venueSelect,
            take: 60,
            orderBy: { createdAt: 'desc' },
        });
    }
    if (!venues.length) {
        venues = await prisma.businessVenue.findMany({
            where: { status: 'APPROVED' },
            select: venueSelect,
            take: 60,
            orderBy: { createdAt: 'desc' },
        });
    }

    const { getProVenueOwnerIds } = await import('./venue.controller.js');
    const proSet = await getProVenueOwnerIds(venues.map(v => v.userId));
    venues = [...venues].sort((a, b) => (proSet.has(b.userId) ? 1 : 0) - (proSet.has(a.userId) ? 1 : 0));

    const pool = venues.map(v => ({
        courtId: null,
        venueId: v.id,
        venueCourtId: v.courts?.[0]?.id || null,
        name: v.name,
        city: v.city || null,
        isProVenue: proSet.has(v.userId),
    }));

    if (pool.length < 3) {
        const courts = await prisma.court.findMany({
            where: {
                verified: true,
                pending: false,
                ...(sport ? { sport } : {}),
            },
            select: { id: true, name: true, city: true },
            take: 20,
            orderBy: { createdAt: 'desc' },
        });
        for (const c of courts) {
            pool.push({
                courtId: c.id,
                venueId: null,
                venueCourtId: null,
                name: c.name,
                city: c.city || null,
                isProVenue: false,
            });
        }
    }
    return pool;
}

function pickDemoCourtsFromPool(pool, sideIndex, shared) {
    if (!pool.length) return [];
    const sharedCourt = shared || pool[0];
    const extra = pool[(sideIndex + 1) % pool.length] || sharedCourt;
    const out = [sharedCourt];
    if (extra && (extra.venueId || extra.courtId || extra.name)
        && (extra.venueId !== sharedCourt.venueId || extra.courtId !== sharedCourt.courtId
            || String(extra.name) !== String(sharedCourt.name))) {
        out.push(extra);
    }
    return sanitizePreferredCourts(out);
}

/**
 * TEST: demo_ bot taraflarına anında random müsaitlik + teklif yazar.
 * Kortlar sisteme kayıtlı Pro+ / onaylı tesislerden seçilir (işletme rezervasyon testi).
 * Sahte "Demo Kort" kayıtları bir sonraki seed'de gerçek tesisle değiştirilir.
 */
async function seedDemoSchedulesForMatches(tournament, matches) {
    if (!tournament?.id || !Array.isArray(matches) || !matches.length) return 0;
    const pending = matches.filter(m => m.status === 'PENDING' && m.p1Id && m.p2Id);
    if (!pending.length) return 0;

    const isTeam = tournament.type === '2' || tournament.type === '4' || tournament.type === '7';
    const sideIds = [...new Set(pending.flatMap(m => [m.p1Id, m.p2Id].filter(Boolean)))];
    const sideMembers = new Map();

    if (isTeam) {
        const teams = await prisma.tournamentTeam.findMany({
            where: { id: { in: sideIds } },
            select: { id: true, player1Id: true, player2Id: true },
        });
        const userIds = [...new Set(teams.flatMap(t => [t.player1Id, t.player2Id].filter(Boolean)))];
        const users = userIds.length
            ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
            : [];
        const byId = Object.fromEntries(users.map(u => [u.id, u]));
        for (const t of teams) {
            sideMembers.set(t.id, [byId[t.player1Id], byId[t.player2Id]].filter(Boolean));
        }
    } else {
        const users = await prisma.user.findMany({
            where: { id: { in: sideIds } },
            select: { id: true, username: true },
        });
        for (const u of users) sideMembers.set(u.id, [u]);
    }

    const isDemoSide = (sideId) => {
        const members = sideMembers.get(sideId) || [];
        return members.length > 0 && members.every(u => u.username?.startsWith('demo_'));
    };

    const playersArrange = tournamentPlayersArrangeCourts(tournament);
    const needsCourtPool = playersArrange && pending.some(m => isDemoSide(m.p1Id) || isDemoSide(m.p2Id));
    const demoCourtPool = needsCourtPool ? await loadRegisteredCourtsForDemo(tournament) : [];
    const sharedDemoCourt = demoCourtPool[0] || null;
    const venueName = sharedDemoCourt?.name
        || String(tournament.location || '').trim()
        || 'Kayıtlı Tesis';
    let updatedCount = 0;

    for (const match of pending) {
        const schedule = normalizeSchedule(match.scheduleData);
        let changed = false;
        for (const side of ['p1', 'p2']) {
            const sideId = side === 'p1' ? match.p1Id : match.p2Id;
            if (!isDemoSide(sideId)) continue;
            const members = sideMembers.get(sideId) || [];
            const byUserId = members[0]?.id || sideId;

            if (!(schedule.availability[side] || []).length) {
                schedule.availability[side] = randomDemoSlots();
                changed = true;
            }
            if (playersArrange && preferredCourtsNeedRealSeed(schedule.preferredCourts[side])) {
                const sideIdx = side === 'p1' ? 0 : 1;
                if (demoCourtPool.length) {
                    schedule.preferredCourts[side] = pickDemoCourtsFromPool(
                        demoCourtPool, sideIdx, sharedDemoCourt,
                    );
                } else {
                    schedule.preferredCourts[side] = [{
                        courtId: null, venueId: null, venueCourtId: null,
                        name: venueName, city: tournament.city || null, isProVenue: false,
                    }];
                }
                changed = true;
            }
            const hasProposal = (schedule.proposals || []).some(p => p.side === side);
            if (!hasProposal) {
                schedule.proposals = [
                    ...(schedule.proposals || []),
                    randomDemoProposal(side, byUserId, venueName, sharedDemoCourt),
                ].slice(-30);
                changed = true;
            }
        }
        // Test: iki demo taraf ortak Cumartesi 10-13 + ortak kayıtlı tesis
        if (isDemoSide(match.p1Id) && isDemoSide(match.p2Id)) {
            const sharedSlot = { weekday: 6, timeFrom: '10:00', timeTo: '13:00' };
            for (const side of ['p1', 'p2']) {
                const list = schedule.availability[side] || [];
                if (!list.some(s => Number(s.weekday) === 6)) {
                    schedule.availability[side] = [...list, sharedSlot];
                    changed = true;
                }
            }
            if (playersArrange && sharedDemoCourt) {
                const p1Need = preferredCourtsNeedRealSeed(schedule.preferredCourts.p1);
                const p2Need = preferredCourtsNeedRealSeed(schedule.preferredCourts.p2);
                if (p1Need || p2Need) {
                    schedule.preferredCourts.p1 = pickDemoCourtsFromPool(demoCourtPool, 0, sharedDemoCourt);
                    schedule.preferredCourts.p2 = pickDemoCourtsFromPool(demoCourtPool, 1, sharedDemoCourt);
                    changed = true;
                }
            }
        }
        if ((schedule.availability.p1 || []).length && (schedule.availability.p2 || []).length) {
            const win = getMatchAvailWindow(tournament, match);
            const sug = computeMatchScheduleSuggested(schedule, {
                playersArrange,
                availFromYmd: win && !win.empty ? win.fromYmd : null,
                availUntilYmd: win && !win.empty ? win.toYmd : null,
            });
            if (JSON.stringify(schedule.suggested || null) !== JSON.stringify(sug)) {
                schedule.suggested = sug;
                changed = true;
            }
        }
        if (!changed) continue;
        await prisma.tournamentMatch.update({
            where: { id: match.id },
            data: { scheduleData: schedule },
        });
        match.scheduleData = schedule;
        updatedCount += 1;
    }
    return updatedCount;
}

/** PENDING maçlarda her iki taraf müsaitlik girdiyse suggested yoksa/eskiyse yenile */
async function healMatchSuggestedOverlaps(tournament, matches) {
    if (!tournament?.id || !Array.isArray(matches)) return 0;
    const playersArrange = tournamentPlayersArrangeCourts(tournament);
    let n = 0;
    for (const match of matches) {
        if (match.status !== 'PENDING' || !match.p1Id || !match.p2Id) continue;
        const schedule = normalizeSchedule(match.scheduleData);
        if (!(schedule.availability.p1 || []).length || !(schedule.availability.p2 || []).length) continue;
        if (schedule.agreed) continue;
        const win = getMatchAvailWindow(tournament, match);
        const sug = computeMatchScheduleSuggested(schedule, {
            playersArrange,
            availFromYmd: win && !win.empty ? win.fromYmd : null,
            availUntilYmd: win && !win.empty ? win.toYmd : null,
        });
        if (JSON.stringify(schedule.suggested || null) === JSON.stringify(sug)) continue;
        schedule.suggested = sug;
        await prisma.tournamentMatch.update({
            where: { id: match.id },
            data: { scheduleData: schedule },
        });
        match.scheduleData = schedule;
        n += 1;
    }
    return n;
}

function tournamentPlayersArrangeCourts(tournament) {
    const loc = String(tournament?.location || '').trim();
    if (!loc) return true;
    return /ortaklaşa|oyuncular|players decide|gemeinsam|соглас/i.test(loc);
}

/** Kort ücreti payı: tekli maç → 2 (yarı), çiftli → 4 (dörtte bir) */
function courtFeeShareParts(tournament) {
    const entry = tournament?.formatConfig?.entry;
    const type = String(tournament?.type || '');
    if (entry === 'DOUBLES' || type === '2' || type === '4' || type === '7') return 4;
    return 2;
}

function toMinsHHMM(t) {
    const [h, m] = String(t || '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

async function resolveVenueProFlag(venueId) {
    if (!venueId) return { venue: null, isProVenue: false };
    const venue = await prisma.businessVenue.findUnique({
        where: { id: venueId },
        select: { id: true, name: true, status: true, userId: true },
    });
    if (!venue || venue.status !== 'APPROVED') return { venue: null, isProVenue: false };
    const { isProVenueOwner } = await import('./venue.controller.js');
    const isPro = await isProVenueOwner(venue.userId);
    return { venue, isProVenue: !!isPro };
}

/** Maç listesinde her maçın scheduleData'sını izleyiciye göre kırp */
async function attachSanitizedSchedules(tournament, matches, userId) {
    const isTeamEngine = tournament.type === '2' || tournament.type === '4' || tournament.type === '7';
    let myTeamIds = new Set();
    if (isTeamEngine && userId) {
        const teams = await prisma.tournamentTeam.findMany({
            where: { tournamentId: tournament.id, OR: [{ player1Id: userId }, { player2Id: userId }] },
            select: { id: true },
        });
        myTeamIds = new Set(teams.map(t => t.id));
    }
    return matches.map(m => {
        const onMatch = isTeamEngine
            ? (myTeamIds.has(m.p1Id) || myTeamIds.has(m.p2Id))
            : (m.p1Id === userId || m.p2Id === userId);
        return {
            ...m,
            scheduleData: sanitizeScheduleForViewer(m.scheduleData, onMatch),
            _iAmMatchSide: onMatch,
        };
    });
}

export const setMatchAvailability = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const slots = Array.isArray(req.body?.slots) ? req.body.slots : null;
        if (!slots) return res.status(400).json({ message: 'slots gerekli' });

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (match.status !== 'PENDING' || !match.p1Id || !match.p2Id) {
            return res.status(400).json({ message: 'Bu maç için müsaitlik girilemez' });
        }

        const side = await resolveUserMatchSide(tournament, match, req.userId);
        if (!side) return res.status(403).json({ message: 'Sadece eşleşen taraflar müsaitlik girebilir' });

        // Sadece bu turun tarih aralığı + bugünden itibaren — geçmiş / tur dışı gün yok
        const win = getMatchAvailWindow(tournament, match);
        if (!win || win.empty) {
            return res.status(400).json({
                message: 'Bu tur için seçilebilir gün kalmadı (süre dolmuş veya tur henüz başlamadı)',
            });
        }
        const cleaned = constrainSlotsToWindow(slots, win.fromYmd, win.toYmd).slice(0, 21);
        if (slots.length > 0 && cleaned.length === 0) {
            return res.status(400).json({
                message: `Müsaitlik yalnızca tur tarihleri içinde seçilebilir (${win.roundStartYmd} – ${win.roundEndYmd}); geçmiş günler kabul edilmez`,
            });
        }

        const schedule = normalizeSchedule(match.scheduleData);
        schedule.availability[side] = cleaned;
        const playersArrange = tournamentPlayersArrangeCourts(tournament);
        if (req.body?.preferredCourts !== undefined) {
            schedule.preferredCourts[side] = playersArrange
                ? sanitizePreferredCourts(req.body.preferredCourts)
                : [];
        }

        // Demo rakip: benim seçtiğim kayıtlı kortları demo tarafa da yaz → ortak kort anında oluşsun
        if (playersArrange && req.body?.preferredCourts !== undefined) {
            const otherSide = side === 'p1' ? 'p2' : 'p1';
            const otherId = otherSide === 'p1' ? match.p1Id : match.p2Id;
            const otherIsDemo = await (async () => {
                const isTeam = tournament.type === '2' || tournament.type === '4' || tournament.type === '7';
                if (!isTeam) {
                    const u = await prisma.user.findUnique({
                        where: { id: otherId },
                        select: { username: true },
                    });
                    return !!u?.username?.startsWith('demo_');
                }
                const team = await prisma.tournamentTeam.findUnique({
                    where: { id: otherId },
                    select: { player1Id: true, player2Id: true },
                });
                if (!team) return false;
                const members = await prisma.user.findMany({
                    where: { id: { in: [team.player1Id, team.player2Id].filter(Boolean) } },
                    select: { username: true },
                });
                return members.length > 0 && members.every(u => u.username?.startsWith('demo_'));
            })();
            if (otherIsDemo) {
                const mine = schedule.preferredCourts[side] || [];
                const theirs = (schedule.preferredCourts[otherSide] || [])
                    .filter(c => c && (c.venueId || c.courtId || !isFakeDemoCourtName(c.name)));
                const merged = sanitizePreferredCourts([...theirs, ...mine]);
                schedule.preferredCourts[otherSide] = merged.length ? merged : mine;
            }
        }

        // İki taraf da bildirdiyse ortak çakışan gün/saat (+ ortak kort) → suggested
        schedule.suggested = computeMatchScheduleSuggested(schedule, {
            playersArrange,
            availFromYmd: win.fromYmd,
            availUntilYmd: win.toYmd,
        });

        const updated = await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: { scheduleData: schedule },
        });
        res.json({
            scheduleData: schedule,
            match: updated,
            availWindow: { from: win.fromYmd, to: win.toYmd, roundStart: win.roundStartYmd, roundEnd: win.roundEndYmd },
        });
    } catch (e) { next(e); }
};

export const proposeMatchSchedule = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const { date, timeFrom, timeTo, venueName, courtId, venueId, venueCourtId, isProVenue } = req.body || {};
        if (!date || !timeFrom || !timeTo) {
            return res.status(400).json({ message: 'Tarih ve saat aralığı zorunlu' });
        }

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (match.status !== 'PENDING' || !match.p1Id || !match.p2Id) {
            return res.status(400).json({ message: 'Bu maç için teklif verilemez' });
        }

        const side = await resolveUserMatchSide(tournament, match, req.userId);
        if (!side) return res.status(403).json({ message: 'Sadece eşleşen taraflar teklif verebilir' });

        const dateYmd = String(date).slice(0, 10);
        const win = getMatchAvailWindow(tournament, match);
        if (!win || win.empty || !isYmdInWindow(dateYmd, win.fromYmd, win.toYmd)) {
            return res.status(400).json({
                message: win
                    ? `Teklif tarihi tur aralığında olmalı (${win.roundStartYmd} – ${win.roundEndYmd}); geçmiş günler kabul edilmez`
                    : 'Bu maç için tarih penceresi yok',
            });
        }

        const playersArrange = tournamentPlayersArrangeCourts(tournament);
        let resolvedVenueName = playersArrange
            ? (String(venueName || '').trim() || null)
            : (String(tournament.location || '').trim() || null);
        let resolvedVenueId = playersArrange ? (venueId || null) : (tournament.venueId || null);
        let resolvedVenueCourtId = playersArrange
            ? (venueCourtId || null)
            : (tournament.venueCourtId || venueCourtId || null);
        let resolvedIsPro = isProVenue === true;
        let resolvedCourtId = playersArrange ? (courtId || null) : (courtId || null);

        if (!playersArrange) {
            // Sabit turnuva mekânı — oyuncu venue değiştiremez
            if (tournament.venueId) {
                const fixed = await resolveVenueProFlag(tournament.venueId);
                resolvedVenueId = tournament.venueId;
                resolvedIsPro = fixed.isProVenue;
                if (fixed.venue?.name) resolvedVenueName = fixed.venue.name;
            }
            resolvedVenueCourtId = tournament.venueCourtId || resolvedVenueCourtId;
        } else if (resolvedVenueId) {
            const info = await resolveVenueProFlag(resolvedVenueId);
            if (info.venue) {
                resolvedIsPro = info.isProVenue;
                if (!resolvedVenueName) resolvedVenueName = info.venue.name;
            } else {
                resolvedVenueId = null;
                resolvedIsPro = false;
            }
        }

        if (playersArrange && !resolvedVenueName && !resolvedCourtId && !resolvedVenueId) {
            return res.status(400).json({ message: 'Kort / mekan adı gerekli' });
        }

        const shareParts = courtFeeShareParts(tournament);
        const schedule = normalizeSchedule(match.scheduleData);
        // İlk teklif = 1. öncelik + (Pro+ ise) tek HOLD hakkı. Sonraki teklifler yalnızca
        // gün/saat/kort bilgisi — yeni askı açılmaz, mevcut askı iptal edilmez.
        const isPrimaryProposal = !Array.isArray(schedule.proposals) || schedule.proposals.length === 0;
        const proposal = {
            id: crypto.randomUUID(),
            side,
            byUserId: req.userId,
            venueName: resolvedVenueName,
            courtId: resolvedCourtId,
            venueId: resolvedVenueId,
            venueCourtId: resolvedVenueCourtId,
            isProVenue: resolvedIsPro,
            date: dateYmd,
            timeFrom: String(timeFrom).slice(0, 5),
            timeTo: String(timeTo).slice(0, 5),
            createdAt: new Date().toISOString(),
            reservationId: null,
            holdUntil: null,
            splitParts: shareParts,
            fullPrice: null,
            amountDue: null,
            isPrimary: isPrimaryProposal,
            priority: isPrimaryProposal ? 1 : (schedule.proposals.length + 1),
        };

        // Pro+ kort: YALNIZCA ilk (öncelikli) teklifte 4 saatlik askı (HOLD)
        if (isPrimaryProposal && resolvedIsPro && resolvedVenueId) {
            try {
                const {
                    isProVenueOwner,
                    validateReservationSlot,
                    isPastDateTime,
                    getSlotPrice,
                } = await import('./venue.controller.js');
                const venue = await prisma.businessVenue.findUnique({ where: { id: resolvedVenueId } });
                if (venue?.status === 'APPROVED' && await isProVenueOwner(venue.userId)) {
                    let vCourtId = resolvedVenueCourtId;
                    if (!vCourtId) {
                        const firstCourt = await prisma.venueCourt.findFirst({
                            where: { venueId: resolvedVenueId },
                            orderBy: { name: 'asc' },
                            select: { id: true },
                        });
                        vCourtId = firstCourt?.id || null;
                    }
                    const d = proposal.date;
                    const tf = proposal.timeFrom;
                    const tt = proposal.timeTo;
                    if (vCourtId && !isPastDateTime(d, tf)) {
                        const slotErr = await validateReservationSlot(
                            venue, vCourtId, d, tf, tt, 'CASH', req.userId,
                        );
                        if (slotErr) {
                            return res.status(slotErr.status).json({ message: slotErr.message });
                        }
                        // Bu maça ait eski askıları düşür (ilk teklifte temiz başlangıç)
                        await prisma.courtReservation.updateMany({
                            where: {
                                tournamentMatchId: matchId,
                                status: 'HOLD',
                            },
                            data: { status: 'CANCELLED', holdUntil: null },
                        });
                        const court = await prisma.venueCourt.findUnique({ where: { id: vCourtId } });
                        let durationMins = toMinsHHMM(tt) - toMinsHHMM(tf);
                        if (durationMins <= 0) durationMins += 1440;
                        const fullPrice = Math.round(getSlotPrice(venue, court, tf, durationMins) || 0);
                        const amountDue = Math.ceil(fullPrice / shareParts);
                        const holdUntil = new Date(Date.now() + 4 * 60 * 60 * 1000);
                        const holdRes = await prisma.courtReservation.create({
                            data: {
                                venueId: resolvedVenueId,
                                courtId: vCourtId,
                                userId: req.userId,
                                date: d,
                                startTime: tf,
                                endTime: tt,
                                paymentMethod: 'CASH',
                                notes: `Askıda (1. öncelik turnuva teklifi): ${tournament.name}. Pay 1/${shareParts} = ${amountDue}/${fullPrice} TL.`,
                                status: 'HOLD',
                                holdUntil,
                                tournamentMatchId: matchId,
                                splitPay: true,
                                fullPrice,
                                amountDue,
                            },
                        });
                        proposal.venueCourtId = vCourtId;
                        proposal.venueName = proposal.venueName || venue.name;
                        proposal.reservationId = holdRes.id;
                        proposal.holdUntil = holdUntil.toISOString();
                        proposal.fullPrice = fullPrice;
                        proposal.amountDue = amountDue;
                        proposal.isProVenue = true;
                        createNotification(
                            venue.userId,
                            'RESERVATION',
                            '⏳ Askıda rezervasyon (1. öncelik teklif)',
                            `${venue.name} — ${d} ${tf}–${tt} 4 saat askıda (turnuva: ${tournament.name}).`,
                            {
                                reservationId: holdRes.id,
                                tournamentId: id,
                                matchId,
                                category: tournament.category,
                                subCategory: tournament.subCategory,
                            },
                        ).catch(() => {});
                    }
                }
            } catch (holdErr) {
                console.error('[proposeMatchSchedule] HOLD create failed:', holdErr?.message);
                return res.status(400).json({
                    message: holdErr?.message || 'Pro+ slot askıya alınamadı — saat dolu olabilir',
                });
            }
        }

        schedule.proposals = [...schedule.proposals, proposal].slice(-30);

        await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: { scheduleData: schedule },
        });

        // TEST: rakip taraf tamamen demo ise teklifi hemen kabul et
        let finalSchedule = schedule;
        let demoAutoAgreed = false;
        try {
            const freshMatch = { ...match, scheduleData: schedule };
            const autoBody = await tryDemoAutoAgreeSchedule(tournament, freshMatch, proposal.id);
            if (autoBody?.scheduleData) {
                finalSchedule = autoBody.scheduleData;
                demoAutoAgreed = true;
            }
        } catch (autoErr) {
            console.error('[proposeMatchSchedule] demo auto-agree failed:', autoErr?.message);
        }

        // Rakip tarafa bildir (demo auto-agree olduysa AGREED bildirimi agreeMatchSchedule'dan gider)
        if (!demoAutoAgreed) {
            const otherSideId = side === 'p1' ? match.p2Id : match.p1Id;
            const notifyIds = new Set();
            const isTeamEngine = tournament.type === '2' || tournament.type === '4' || tournament.type === '7';
            if (isTeamEngine && otherSideId) {
                const team = await prisma.tournamentTeam.findUnique({ where: { id: otherSideId } });
                if (team?.player1Id) notifyIds.add(team.player1Id);
                if (team?.player2Id) notifyIds.add(team.player2Id);
            } else if (otherSideId) {
                notifyIds.add(otherSideId);
            }
            const holdHint = proposal.reservationId
                ? ` · Askıda 4s · pay 1/${shareParts}${proposal.amountDue != null ? ` (${proposal.amountDue} TL)` : ''}`
                : '';
            for (const uid of notifyIds) {
                if (!uid || uid === req.userId) continue;
                createNotification(
                    uid,
                    'TOURNAMENT_SCHEDULE_PROPOSAL',
                    '📅 Maç yeri / zaman teklifi',
                    `${tournament.name}: ${proposal.date} ${proposal.timeFrom}-${proposal.timeTo}${proposal.venueName ? ` · ${proposal.venueName}` : ''}${holdHint}`,
                    { tournamentId: id, matchId, category: tournament.category, subCategory: tournament.subCategory },
                ).catch(() => {});
                emitToUser(uid, 'tournament:schedule_updated', { tournamentId: id, matchId, scheduleData: finalSchedule });
            }
        } else {
            // Teklif sahibine de anlık güncelleme (agree zaten her iki tarafı bildirir; ekstra socket)
            emitToUser(req.userId, 'tournament:schedule_updated', {
                tournamentId: id, matchId, scheduleData: finalSchedule,
            });
        }

        res.json({ scheduleData: finalSchedule, proposal, demoAutoAgreed });
    } catch (e) { next(e); }
};

export const agreeMatchSchedule = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const { proposalId } = req.body || {};
        if (!proposalId) return res.status(400).json({ message: 'proposalId gerekli' });

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı' });

        const side = await resolveUserMatchSide(tournament, match, req.userId);
        if (!side) return res.status(403).json({ message: 'Sadece eşleşen taraflar anlaşabilir' });

        const schedule = normalizeSchedule(match.scheduleData);
        const proposal = schedule.proposals.find(p => p.id === proposalId);
        if (!proposal) return res.status(404).json({ message: 'Teklif bulunamadı' });
        // Kendi teklifini tek taraflı "anlaştık" sayma — rakip onaylamalı
        if (proposal.side === side) {
            return res.status(400).json({ message: 'Kendi teklifinizi onaylayamazsınız — rakibin onayı gerekir' });
        }

        const shareParts = Number(proposal.splitParts) || courtFeeShareParts(tournament);
        schedule.agreed = {
            venueName: proposal.venueName || null,
            courtId: proposal.courtId || null,
            venueId: proposal.venueId || tournament.venueId || null,
            venueCourtId: proposal.venueCourtId || tournament.venueCourtId || null,
            isProVenue: proposal.isProVenue === true,
            date: proposal.date,
            timeFrom: proposal.timeFrom,
            timeTo: proposal.timeTo,
            proposalId: proposal.id,
            agreedByUserId: req.userId,
            agreedAt: new Date().toISOString(),
            reservationId: proposal.reservationId || null,
            reservationStatus: null,
            holdUntil: null,
            splitPay: true,
            splitParts: shareParts,
            fullPrice: proposal.fullPrice ?? null,
            amountDue: proposal.amountDue ?? null,
        };

        // Teklifte açılan HOLD varsa kabul → kesin rezervasyon + ortak ödeme payı
        if (proposal.reservationId) {
            try {
                const {
                    computeReservationStatus,
                } = await import('./venue.controller.js');
                const holdRes = await prisma.courtReservation.findUnique({
                    where: { id: proposal.reservationId },
                    include: {
                        venue: { select: { id: true, userId: true, name: true, approvalMode: true, branch: true } },
                        court: { select: { id: true, name: true, approvalMode: true } },
                    },
                });
                if (!holdRes || holdRes.status !== 'HOLD') {
                    return res.status(400).json({
                        message: 'Askıdaki rezervasyon süresi dolmuş veya iptal — yeni teklif gönderin',
                    });
                }
                if (holdRes.holdUntil && new Date(holdRes.holdUntil) < new Date()) {
                    await prisma.courtReservation.update({
                        where: { id: holdRes.id },
                        data: { status: 'CANCELLED', holdUntil: null },
                    });
                    return res.status(400).json({ message: 'Askı süresi dolmuş — yeni teklif gönderin' });
                }

                const fullPrice = holdRes.fullPrice ?? proposal.fullPrice ?? 0;
                const amountDue = Math.ceil(Number(fullPrice) / shareParts);
                const initialStatus = computeReservationStatus(holdRes.court, holdRes.venue, holdRes.paymentMethod || 'CASH');
                const updated = await prisma.courtReservation.update({
                    where: { id: holdRes.id },
                    data: {
                        status: initialStatus,
                        holdUntil: null,
                        splitPay: true,
                        fullPrice: Number(fullPrice) || 0,
                        amountDue,
                        notes: `Turnuva eşleşmesi kesin: ${tournament.name}. Ortak ödeme 1/${shareParts} = ${amountDue}/${fullPrice} TL.`,
                        tournamentMatchId: matchId,
                    },
                });
                schedule.agreed.reservationId = updated.id;
                schedule.agreed.reservationStatus = updated.status;
                schedule.agreed.venueCourtId = updated.courtId;
                schedule.agreed.fullPrice = Number(fullPrice) || 0;
                schedule.agreed.amountDue = amountDue;
                schedule.agreed.isProVenue = true;
                schedule.agreed.holdUntil = null;

                createNotification(
                    holdRes.venue.userId,
                    'RESERVATION',
                    initialStatus === 'CONFIRMED' ? '✅ Turnuva rezervasyonu kesinleşti' : '🔔 Turnuva rezervasyon onayı',
                    `${holdRes.venue.name} — ${holdRes.date} ${holdRes.startTime}–${holdRes.endTime} kesinleşti (turnuva: ${tournament.name}). Ortak ödeme 1/${shareParts}.`,
                    {
                        reservationId: updated.id,
                        tournamentId: id,
                        matchId,
                        category: tournament.category,
                        subCategory: tournament.subCategory,
                    },
                ).catch(() => {});
            } catch (finErr) {
                console.error('[agreeMatchSchedule] HOLD finalize failed:', finErr?.message);
                return res.status(400).json({ message: finErr?.message || 'Rezervasyon kesinleştirilemedi' });
            }
        } else {
            // Bilgi teklifi kabul edildi — bu maçtaki diğer askıları (1. öncelik HOLD) düşür
            await prisma.courtReservation.updateMany({
                where: { tournamentMatchId: matchId, status: 'HOLD' },
                data: { status: 'CANCELLED', holdUntil: null },
            }).catch(() => {});
        }

        const updateData = { scheduleData: schedule };
        if (proposal.courtId) updateData.courtId = proposal.courtId;

        await prisma.tournamentMatch.update({ where: { id: matchId }, data: updateData });

        // Her iki taraf + yaratıcıya bildir
        const notifyIds = new Set([tournament.creatorId]);
        const isTeamEngine = tournament.type === '2' || tournament.type === '4' || tournament.type === '7';
        for (const sideId of [match.p1Id, match.p2Id].filter(Boolean)) {
            if (isTeamEngine) {
                const team = await prisma.tournamentTeam.findUnique({ where: { id: sideId } }).catch(() => null);
                if (team?.player1Id) notifyIds.add(team.player1Id);
                if (team?.player2Id) notifyIds.add(team.player2Id);
            } else {
                notifyIds.add(sideId);
            }
        }
        const place = [
            schedule.agreed.date,
            `${schedule.agreed.timeFrom}-${schedule.agreed.timeTo}`,
            schedule.agreed.venueName,
        ].filter(Boolean).join(' · ');
        const payNote = schedule.agreed.reservationId
            ? ` · Ortak ödeme 1/${shareParts}${schedule.agreed.amountDue != null ? ` (${schedule.agreed.amountDue} TL)` : ''}`
            : '';
        for (const uid of notifyIds) {
            if (!uid) continue;
            createNotification(
                uid,
                'TOURNAMENT_SCHEDULE_AGREED',
                '✅ Maç yeri / zamanı anlaşıldı',
                `${tournament.name}: ${place}${payNote}`,
                { tournamentId: id, matchId, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
            emitToUser(uid, 'tournament:schedule_updated', { tournamentId: id, matchId, scheduleData: schedule });
        }

        res.json({ scheduleData: schedule });
    } catch (e) { next(e); }
};

export const clearMatchScheduleAgreed = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı' });

        const side = await resolveUserMatchSide(tournament, match, req.userId);
        if (!side) return res.status(403).json({ message: 'Yetkisiz' });

        const schedule = normalizeSchedule(match.scheduleData);
        schedule.agreed = null;
        await prisma.tournamentMatch.update({ where: { id: matchId }, data: { scheduleData: schedule } });
        res.json({ scheduleData: schedule });
    } catch (e) { next(e); }
};

/**
 * Anlaşılan gün/saat/tesis Pro+ ise eşleşen taraflar kart içinden rezervasyon oluşturur.
 * Body: { venueCourtId?, paymentMethod?, splitPay? }
 * — splitPay true (veya turnuva feeType=SHARED): tam fiyatın yarısı amountDue.
 * — Mevcut HOLD askı varsa CANCELLED yerine CONFIRMED/PENDING'e yükseltir.
 */
export const reserveMatchSchedule = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const paymentMethod = ['CASH', 'EFT', 'CREDIT_CARD', 'ONLINE'].includes(req.body?.paymentMethod)
            ? req.body.paymentMethod
            : 'CASH';

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (match.status !== 'PENDING' || !match.p1Id || !match.p2Id) {
            return res.status(400).json({ message: 'Bu maç için rezervasyon yapılamaz' });
        }

        const side = await resolveUserMatchSide(tournament, match, req.userId);
        if (!side) return res.status(403).json({ message: 'Sadece eşleşen taraflar rezervasyon yapabilir' });

        const schedule = normalizeSchedule(match.scheduleData);
        if (!schedule.agreed?.date || !schedule.agreed?.timeFrom || !schedule.agreed?.timeTo) {
            return res.status(400).json({ message: 'Önce gün ve saat üzerinde anlaşın' });
        }

        const existingHoldId = schedule.agreed.reservationId || null;
        let existingHold = null;
        if (existingHoldId) {
            existingHold = await prisma.courtReservation.findUnique({ where: { id: existingHoldId } });
            if (existingHold && existingHold.status !== 'HOLD' && existingHold.status !== 'CANCELLED') {
                return res.status(400).json({ message: 'Bu eşleşme için zaten rezervasyon var' });
            }
            if (existingHold?.status === 'CANCELLED') existingHold = null;
        }

        const venueId = schedule.agreed.venueId || tournament.venueId || null;
        if (!venueId) {
            return res.status(400).json({ message: 'Rezervasyon için Pro+ tesis seçilmiş olmalı' });
        }

        const {
            isProVenueOwner,
            validateReservationSlot,
            computeReservationStatus,
            assertNotVenuePolicyBlocked,
            getReservationOpensAt,
            isPastDateTime,
            getSlotPrice,
        } = await import('./venue.controller.js');

        const venue = await prisma.businessVenue.findUnique({ where: { id: venueId } });
        if (!venue || venue.status !== 'APPROVED') {
            return res.status(404).json({ message: 'Tesis bulunamadı' });
        }
        if (!await isProVenueOwner(venue.userId)) {
            return res.status(403).json({
                message: 'Bu tesis uygulama içinden rezervasyon almıyor. Varsa telefon numarasından işletmeyi arayarak rezervasyon yapabilirsiniz.',
            });
        }

        const venueCourtId = req.body?.venueCourtId
            || schedule.agreed.venueCourtId
            || existingHold?.courtId
            || tournament.venueCourtId
            || null;
        if (!venueCourtId) {
            return res.status(400).json({ message: 'Kort / saha seçin' });
        }

        const court = await prisma.venueCourt.findUnique({ where: { id: venueCourtId } });
        if (!court || court.venueId !== venueId) {
            return res.status(404).json({ message: 'Kort bulunamadı' });
        }

        const isBlocked = await prisma.venueBlock.findUnique({
            where: { venueId_userId: { venueId, userId: req.userId } },
        });
        if (isBlocked) return res.status(403).json({ message: 'Bu tesiste rezervasyon yapamazsınız' });

        const policyBlock = await assertNotVenuePolicyBlocked(venue, req.userId);
        if (policyBlock) return res.status(policyBlock.status).json({ message: policyBlock.message });

        const date = String(schedule.agreed.date).slice(0, 10);
        const startTime = String(schedule.agreed.timeFrom).slice(0, 5);
        const endTime = String(schedule.agreed.timeTo).slice(0, 5);

        if (isPastDateTime(date, startTime)) {
            return res.status(400).json({ message: 'Geçmiş bir tarih/saate rezervasyon yapılamaz' });
        }
        const opensAt = getReservationOpensAt(venue, date);
        if (opensAt && new Date() < opensAt) {
            return res.status(403).json({
                message: `Bu tarih için rezervasyonlar henüz açılmadı. Açılış: ${opensAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`,
            });
        }

        // HOLD kendi slotunu hariç tutarak doğrula
        const slotErr = await validateReservationSlot(
            venue, venueCourtId, date, startTime, endTime, paymentMethod, req.userId,
            existingHold?.id || null,
        );
        if (slotErr) return res.status(slotErr.status).json({ message: slotErr.message });

        const toMins = (t) => {
            const [h, m] = String(t || '').split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
        };
        let durationMins = toMins(endTime) - toMins(startTime);
        if (durationMins <= 0) durationMins += 1440;
        const fullPrice = Math.round(getSlotPrice(venue, court, startTime, durationMins) || 0);

        // Turnuva maçı: tekli 1/2, çiftli 1/4 ortak ödeme
        const shareParts = courtFeeShareParts(tournament);
        const wantSplit = req.body?.splitPay !== false && req.body?.splitPay !== 'false';
        const amountDue = wantSplit ? Math.ceil(fullPrice / shareParts) : fullPrice;

        // Rakip tarafın ödeme sorumlusu (bireysel id veya takımın 1. oyuncusu)
        const otherSideId = side === 'p1' ? match.p2Id : match.p1Id;
        const isTeamEngine = tournament.type === '2' || tournament.type === '4' || tournament.type === '7';
        let coPayerUserId = null;
        if (wantSplit && otherSideId) {
            if (isTeamEngine) {
                const team = await prisma.tournamentTeam.findUnique({
                    where: { id: otherSideId },
                    select: { player1Id: true },
                }).catch(() => null);
                coPayerUserId = team?.player1Id || null;
            } else {
                coPayerUserId = otherSideId;
            }
        }

        const initialStatus = computeReservationStatus(court, venue, paymentMethod);
        const splitNote = wantSplit
            ? ` Ortaklaşa ödeme 1/${shareParts}: tam ${fullPrice} TL, pay ${amountDue} TL.`
            : ` Ücret: ${fullPrice} TL.`;

        let reservation;
        if (existingHold) {
            reservation = await prisma.courtReservation.update({
                where: { id: existingHold.id },
                data: {
                    courtId: venueCourtId,
                    userId: req.userId,
                    paymentMethod,
                    notes: `Turnuva eşleşmesi: ${tournament.name}.${splitNote}`,
                    status: initialStatus,
                    holdUntil: null,
                    splitPay: wantSplit,
                    fullPrice,
                    amountDue,
                    coPayerUserId,
                    tournamentMatchId: matchId,
                },
            });
        } else {
            reservation = await prisma.courtReservation.create({
                data: {
                    venueId,
                    courtId: venueCourtId,
                    userId: req.userId,
                    date,
                    startTime,
                    endTime,
                    paymentMethod,
                    notes: `Turnuva eşleşmesi: ${tournament.name}.${splitNote}`,
                    status: initialStatus,
                    splitPay: wantSplit,
                    fullPrice,
                    amountDue,
                    coPayerUserId,
                    tournamentMatchId: matchId,
                },
            });
        }

        schedule.agreed = {
            ...schedule.agreed,
            venueId,
            venueCourtId,
            venueName: schedule.agreed.venueName || venue.name,
            isProVenue: true,
            reservationId: reservation.id,
            reservationStatus: reservation.status,
            holdUntil: null,
            reservedByUserId: req.userId,
            reservedAt: new Date().toISOString(),
            splitPay: wantSplit,
            fullPrice,
            amountDue,
            coPayerUserId,
        };

        await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: { scheduleData: schedule },
        });

        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { username: true },
        });
        const pmLabel = {
            CASH: 'Kortta Öde',
            EFT: 'EFT/Havale',
            CREDIT_CARD: 'Kortta Kredi Kartı',
            ONLINE: 'Online',
        }[paymentMethod] || paymentMethod;

        createNotification(
            venue.userId,
            'RESERVATION',
            initialStatus === 'CONFIRMED' ? '✅ Turnuva maçı rezervasyonu' : '🔔 Turnuva maçı rezervasyon talebi',
            `${user?.username || 'Oyuncu'}, ${venue.name} — ${court.name || 'Kort'} için ${date} ${startTime}–${endTime} (turnuva: ${tournament.name}). Ödeme: ${pmLabel}.${splitNote}`,
            { reservationId: reservation.id, tournamentId: id, matchId, category: tournament.category, subCategory: tournament.subCategory },
        ).catch(() => {});

        if (wantSplit && coPayerUserId && coPayerUserId !== req.userId) {
            createNotification(
                coPayerUserId,
                'RESERVATION',
                '🤝 Ortaklaşa kort ücreti',
                `${tournament.name}: kort ücreti ${fullPrice} TL — senin payın ${amountDue} TL (${date} ${startTime}–${endTime}).`,
                { reservationId: reservation.id, tournamentId: id, matchId, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
        }

        const notifyIds = new Set([tournament.creatorId]);
        for (const sideId of [match.p1Id, match.p2Id].filter(Boolean)) {
            if (isTeamEngine) {
                const team = await prisma.tournamentTeam.findUnique({ where: { id: sideId } }).catch(() => null);
                if (team?.player1Id) notifyIds.add(team.player1Id);
                if (team?.player2Id) notifyIds.add(team.player2Id);
            } else {
                notifyIds.add(sideId);
            }
        }
        for (const uid of notifyIds) {
            if (!uid) continue;
            emitToUser(uid, 'tournament:schedule_updated', { tournamentId: id, matchId, scheduleData: schedule });
        }

        res.status(201).json({ scheduleData: schedule, reservation });
    } catch (e) { next(e); }
};

/**
 * Deadline sonrası 0-0 beraberlik (puan/ELO yok). Job (grace sonrası) ve turnuva sahibi
 * "skor girilmeyenlere beraberlik" aksiyonu ortak kullanır.
 * `tournament` ACCEPTED participants (user) içermeli — advanceTournamentAfterMatch için.
 */
export async function applyTournamentMatchAutoDraw(match, tournament, { source = 'auto', notifyPlayers = true } = {}) {
    if (!match || match.status !== 'PENDING' || !match.p1Id || !match.p2Id) return null;
    if (!tournament || tournament.status !== 'IN_PROGRESS') return null;

    const now = new Date();
    const isTeamTournament = tournament.type === '2' || tournament.type === '4';
    let p1Members = [match.p1Id].filter(Boolean);
    let p2Members = [match.p2Id].filter(Boolean);
    if (isTeamTournament) {
        const teams = await prisma.tournamentTeam.findMany({
            where: { id: { in: [match.p1Id, match.p2Id].filter(Boolean) } },
        });
        const t1 = teams.find(t => t.id === match.p1Id);
        const t2 = teams.find(t => t.id === match.p2Id);
        if (t1) p1Members = [t1.player1Id, t1.player2Id].filter(Boolean);
        if (t2) p2Members = [t2.player1Id, t2.player2Id].filter(Boolean);
    }

    const score = {
        sets: [], winner: null, p1Sets: 0, p2Sets: 0, p1Games: 0, p2Games: 0,
        p1EloDelta: 0, p2EloDelta: 0,
        p1RatingBefore: null, p1RatingAfter: null, p2RatingBefore: null, p2RatingAfter: null,
        p1MemberRatings: [], p2MemberRatings: [],
        autoDraw: true,
        creatorDraw: source === 'creator',
    };

    await prisma.tournamentMatch.update({
        where: { id: match.id },
        data: {
            score, status: 'COMPLETED', winnerId: null,
            scoreEnteredBy: source === 'creator' ? (tournament.creatorId || null) : null,
            p1Confirmed: true, p2Confirmed: true,
            scoreSubmittedAt: now,
        },
    });

    await advanceTournamentAfterMatch(tournament, match, isTeamTournament, false);

    if (notifyPlayers) {
        const title = source === 'creator'
            ? '🤝 Maç berabere kaydedildi'
            : '🤝 Maç süresi doldu, berabere sayıldı';
        const body = source === 'creator'
            ? `${tournament.name}: ${match.p1Name || '?'} - ${match.p2Name || '?'} maçı turnuva sahibi tarafından berabere kaydedildi.`
            : `${tournament.name}: ${match.p1Name || '?'} - ${match.p2Name || '?'} maçı süresi içinde oynanmadığı için otomatik olarak berabere kaydedildi.`;
        for (const uid of [...new Set([...p1Members, ...p2Members])]) {
            createNotification(
                uid, 'TOURNAMENT_MATCH_AUTO_DRAW', title, body,
                { tournamentId: tournament.id, matchId: match.id, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
        }
    }

    return match;
}

/**
 * Turnuva sahibi: süresi dolmuş (veya seçilen) skor girilmemiş maçlara 0-0 beraberlik girer.
 * Body: { matchIds?: string[], phase?: string, round?: number }
 * - matchIds varsa sadece onlar (PENDING + iki taraf dolu)
 * - yoksa phase+round (veya tüm turnuva) içinde deadline geçmiş PENDING'ler
 * Play-off'ta beraberlik bracket'ı tıkayacağı için sadece GROUP (veya açıkça seçilen matchIds).
 */
export const drawUnscoredMatches = async (req, res, next) => {
    try {
        const { id } = req.params;
        const matchIds = Array.isArray(req.body?.matchIds) ? req.body.matchIds.filter(Boolean) : [];
        const phase = req.body?.phase != null ? String(req.body.phase) : null;
        const round = req.body?.round != null ? parseInt(req.body.round, 10) : null;

        const tournament = await prisma.tournament.findUnique({
            where: { id },
            include: {
                participants: {
                    where: { status: 'ACCEPTED' },
                    include: { user: { select: { id: true, username: true, fullName: true } } },
                },
            },
        });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        if (tournament.status !== 'IN_PROGRESS') return res.status(400).json({ message: 'Turnuva devam etmiyor' });

        const isCreator = tournament.creatorId === req.userId;
        if (!isCreator) {
            const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
            if (!u?.isAdmin) return res.status(403).json({ message: 'Yalnızca turnuva sahibi veya admin beraberlik girebilir' });
        }

        const now = new Date();
        let targets;
        if (matchIds.length > 0) {
            targets = await prisma.tournamentMatch.findMany({
                where: {
                    tournamentId: id,
                    id: { in: matchIds },
                    status: 'PENDING',
                    p1Id: { not: null },
                    p2Id: { not: null },
                },
            });
        } else {
            const where = {
                tournamentId: id,
                status: 'PENDING',
                phase: phase || 'GROUP',
                deadline: { lt: now },
                p1Id: { not: null },
                p2Id: { not: null },
            };
            if (Number.isFinite(round) && round >= 1) where.round = round;
            targets = await prisma.tournamentMatch.findMany({ where });
        }

        // Play-off / eleme: beraberlik kazanan üretmez — sadece GROUP veya açıkça seçilen id'ler
        if (matchIds.length === 0) {
            targets = targets.filter(m => m.phase === 'GROUP');
        }

        if (targets.length === 0) {
            return res.status(400).json({ message: 'Berabere kaydedilecek skor girilmemiş maç bulunamadı' });
        }

        let drawn = 0;
        for (const match of targets) {
            try {
                const ok = await applyTournamentMatchAutoDraw(match, tournament, { source: 'creator', notifyPlayers: true });
                if (ok) drawn++;
            } catch (err) {
                console.error(`[drawUnscoredMatches] match ${match.id}:`, err.message);
            }
        }

        const allMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });

        const parts = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id, status: 'ACCEPTED', userId: { not: null } },
            select: { userId: true },
        });
        const notifyIds = new Set([tournament.creatorId, ...parts.map(p => p.userId)].filter(Boolean));
        for (const uid of notifyIds) {
            emitToUser(uid, 'tournament:match_scored', { tournamentId: id, matches: allMatches });
        }

        res.json({ drawn, matches: allMatches });
    } catch (e) { next(e); }
};

