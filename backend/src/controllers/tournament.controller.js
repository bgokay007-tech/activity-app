import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';

// Turnuva başlangıç tarihini Turkey local time (UTC+3) olarak döner
function tournamentBaseDate(tournament) {
    if (!tournament.eventDate) return new Date();
    const dateStr = new Date(tournament.eventDate).toISOString().split('T')[0];
    const timeStr = tournament.eventTime || '00:00';
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

/** Compute GROUP-phase standings from completed matches.
 *  Tiebreaker for type '1' (Bireysel Rekabetçi): puan → averaj (gamesWon/totalGames) → set oranı
 */
function computeStandings(players, matches, tournamentType) {
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
        if (b.points !== a.points) return b.points - a.points;
        // Bireysel Rekabetçi (type '1'): averaj tiebreaker (Rule 5)
        if (tournamentType === '1') {
            const averaj = (x) => {
                const total = x.gamesWon + x.gamesLost;
                return total === 0 ? 0 : x.gamesWon / total;
            };
            if (Math.abs(averaj(b) - averaj(a)) > 0.001) return averaj(b) - averaj(a);
        }
        const sr = (x) => x.setsLost === 0 ? (x.setsWon === 0 ? 0 : Infinity) : x.setsWon / x.setsLost;
        if (Math.abs(sr(b) - sr(a)) > 0.001) return sr(b) - sr(a);
        const gr = (x) => x.gamesLost === 0 ? (x.gamesWon === 0 ? 0 : Infinity) : x.gamesWon / x.gamesLost;
        return gr(b) - gr(a);
    });
}

/** Bireysel Rekabetçi (type '1'): DB'den güncel ELO alarak sonraki GROUP turunu oluşturur.
 *  Daha önce eşleşmiş çiftleri tekrar eşleştirmez. Deadline = eventDate + round*7 gün.
 */
async function generateNextEloRound(tournament, nextRound, playedPairKeys) {
    // 1. turdaki oyuncu ID'lerini al — sonradan eklenen katılımcılar dahil edilmez
    const round1Matches = await prisma.tournamentMatch.findMany({
        where: { tournamentId: tournament.id, phase: 'GROUP', round: 1 },
        select: { p1Id: true, p2Id: true },
    });
    const originalPlayerIds = new Set();
    round1Matches.forEach(m => {
        if (m.p1Id) originalPlayerIds.add(m.p1Id);
        if (m.p2Id) originalPlayerIds.add(m.p2Id);
    });

    const participants = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: tournament.id, status: 'ACCEPTED', userId: { in: [...originalPlayerIds] } },
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

    const players = participants
        .filter(p => p.userId && p.user)
        .map(p => ({
            id: p.userId,
            fullName: p.user.fullName || null,
            username: p.user.username || null,
            skillRating: p.user.interests?.[0]?.skillRating || 0,
        }));

    const sorted = [...players].sort((a, b) => (a.skillRating || 0) - (b.skillRating || 0));
    const played = new Set(playedPairKeys);
    const unmatched = new Set(sorted.map(p => p.id));
    const roundPairs = [];

    for (const player of sorted) {
        if (!unmatched.has(player.id)) continue;
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
            const perm = await prisma.tournamentPermissionRequest.findUnique({ where: { userId: req.userId }, select: { status: true } });
            if (perm?.status !== 'APPROVED') {
                return res.status(403).json({ message: 'Turnuva oluşturma izniniz yok. Lütfen admin onayı alın.' });
            }
        }
        const {
            name, type, category, subCategory, description,
            scope, genderType, isPaid, feeType, playerFee, paymentMethod, ibanNumber, ibanHolder,
            prize1, prize2, prize3, contactPhone,
            minPlayers, maxPlayers, minRating, maxRating,
            matchmakingType, matchFrequency, matchTimeStart, matchTimeEnd,
            setsPerMatch, advantageScoring, matchesBeforePlayoff, playoffQualifiers,
            rules,
            location, city,
            surface, isIndoor,
            eventDate, eventTime, eventEndDate, eventEndTime,
            startDate, startTime, endDate, endTime,
        } = req.body;
        const tournament = await prisma.tournament.create({
            data: {
                name,
                type: type || '1',
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
                contactPhone: contactPhone || null,
                minRating: minRating !== undefined && minRating !== '' ? parseFloat(minRating) : null,
                maxRating: maxRating !== undefined && maxRating !== '' ? parseFloat(maxRating) : null,
                matchmakingType: matchmakingType || 'ELO',
                matchFrequency: matchFrequency || 'FLEXIBLE',
                matchTimeStart: matchTimeStart || null,
                matchTimeEnd: matchTimeEnd || null,
                minPlayers: minPlayers ? parseInt(minPlayers) : 2,
                setsPerMatch: setsPerMatch ? parseInt(setsPerMatch) : null,
                advantageScoring: advantageScoring !== false,
                matchesBeforePlayoff: matchesBeforePlayoff ? parseInt(matchesBeforePlayoff) : null,
                playoffQualifiers: playoffQualifiers ? parseInt(playoffQualifiers) : null,
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
                creatorId: req.userId,
                status: 'OPEN',
            },
            include: {
                creator: { select: { id: true, username: true, fullName: true } },
                _count: { select: { participants: { where: { status: 'ACCEPTED' } } } },
            },
        });
        res.status(201).json(tournament);

        // Notify city-alert subscribers for tournaments tab (async, non-blocking)
        const creatorInfo = await prisma.user.findUnique({ where: { id: req.userId }, select: { city: true, username: true } }).catch(() => null);
        notifyCitySubscribers({
            subCategory: tournament.subCategory,
            category: tournament.category,
            senderCity: tournament.city || creatorInfo?.city || null,
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

        const where = { status: { notIn: ['CANCELLED', 'COMPLETED'] } };
        if (category)    where.category    = category;
        if (subCategory) where.subCategory = subCategory;

        const myId = req.userId;
        const tournaments = await prisma.tournament.findMany({
            where,
            include: {
                creator: { select: { id: true, username: true, fullName: true } },
                _count:  { select: { participants: { where: { status: 'ACCEPTED' } } } },
                participants: { where: { userId: myId }, select: { userId: true, status: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(tournaments);
    } catch (e) { next(e); }
};

export const joinTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { note } = req.body;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        if (!['OPEN', 'IN_PROGRESS'].includes(tournament.status)) {
            return res.status(400).json({ message: 'Bu turnuvaya katılım mümkün değil' });
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
            prisma.user.findUnique({ where: { id: req.userId }, select: { tournamentBanRemaining: true } }),
            prisma.userInterest.findUnique({
                where: { userId_category_subCategory: { userId: req.userId, category: tournament.category, subCategory: tournament.subCategory } },
                select: { skillRating: true },
            }),
        ]);
        if (userBan?.tournamentBanRemaining > 0) {
            await prisma.user.update({ where: { id: req.userId }, data: { tournamentBanRemaining: { decrement: 1 } } });
            return res.status(403).json({ message: `Geç iptal cezası nedeniyle ${userBan.tournamentBanRemaining} turnuvaya daha katılamazsınız.` });
        }

        // Check rating limits
        const userRating = userInterest?.skillRating ?? 0;
        if (tournament.minRating !== null && tournament.minRating !== undefined && userRating < tournament.minRating) {
            return res.status(403).json({ message: `Bu turnuvaya katılmak için en az ${tournament.minRating}★ dereceniz olması gerekiyor. Mevcut dereceniz: ${userRating.toFixed(2)}★` });
        }
        if (tournament.maxRating !== null && tournament.maxRating !== undefined && userRating > tournament.maxRating) {
            return res.status(403).json({ message: `Bu turnuva en fazla ${tournament.maxRating}★ dereceli oyuncular içindir. Mevcut dereceniz: ${userRating.toFixed(2)}★` });
        }

        const existing = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });
        if (existing) return res.status(400).json({ message: 'You already sent a join request' });

        const participant = await prisma.tournamentParticipant.create({
            data: { tournamentId: id, userId: req.userId, note, status: "PENDING", acceptedAt: null },
            include: { user: { select: { id: true, username: true, fullName: true } } },
        });


        res.status(201).json(participant);
    } catch (e) { next(e); }
};

export const getJoinRequests = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not your tournament' });

        const requests = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id },
            include: {
                user: {
                    select: {
                        id: true, username: true, fullName: true, avatar: true,
                        interests: {
                            where: { category: tournament.category, subCategory: tournament.subCategory },
                            select: { skillRating: true, level: true },
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
                            select: { skillRating: true, level: true },
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

        // Notify all accepted participants so their open modals refresh in real-time
        if (status === 'ACCEPTED') {
            const accepted = await prisma.tournamentParticipant.findMany({
                where: { tournamentId: id, status: 'ACCEPTED' },
                select: { userId: true },
            });
            const payload = { tournamentId: id, participant: updated };
            accepted.forEach(p => emitToUser(p.userId, 'tournament:participant_accepted', payload));
        }

        if (status === 'REJECTED') {
            const body = reason ? `"${tournament.name}" turnuvasına başvurunuz reddedildi. Neden: ${reason}` : `"${tournament.name}" turnuvasına başvurunuz reddedildi.`;
            await createNotification(userId, 'TOURNAMENT_REJECT', '❌ Başvurunuz Reddedildi', body, { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory });
        }

        res.json(updated);
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
        const updated = await prisma.tournament.update({
            where: { id },
            data: {
                ...(b.name                !== undefined && { name: b.name }),
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
                ...(b.minRating          !== undefined && { minRating: b.minRating !== '' && b.minRating !== null ? parseFloat(b.minRating) : null }),
                ...(b.maxRating          !== undefined && { maxRating: b.maxRating !== '' && b.maxRating !== null ? parseFloat(b.maxRating) : null }),
                ...(b.matchmakingType    !== undefined && { matchmakingType: b.matchmakingType || null }),
                ...(b.matchFrequency     !== undefined && { matchFrequency: b.matchFrequency || null }),
                ...(b.matchTimeStart     !== undefined && { matchTimeStart: b.matchTimeStart || null }),
                ...(b.matchTimeEnd       !== undefined && { matchTimeEnd: b.matchTimeEnd || null }),
                ...(b.minPlayers          !== undefined && { minPlayers: parseInt(b.minPlayers) }),
                ...(b.maxPlayers          !== undefined && { maxPlayers: parseInt(b.maxPlayers) }),
                ...(b.setsPerMatch        !== undefined && { setsPerMatch: b.setsPerMatch ? parseInt(b.setsPerMatch) : null }),
                ...(b.advantageScoring    !== undefined && { advantageScoring: b.advantageScoring === true }),
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
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId && !req.isAdmin) return res.status(403).json({ message: 'Not authorized' });
        await prisma.tournament.delete({ where: { id } });
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

export const startTournament = async (req, res, next) => {
    try {
        const { id } = req.params;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not authorized' });
        if (tournament.status !== 'OPEN') return res.status(400).json({ message: 'Tournament already started or completed' });

        const rawParticipants = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id, status: 'ACCEPTED' },
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
            orderBy: [{ acceptedAt: 'asc' }, { createdAt: 'asc' }],
        });

        // Main list = first maxPlayers accepted (by acceptance order); waitlist = the rest
        if (!tournament.maxPlayers) {
            return res.status(400).json({ message: 'LÃ¼tfen turnuva baÅŸlatmadan Ã¶nce maksimum oyuncu sayÄ±sÄ±nÄ± (AS kadro) belirleyin.' });
        }
        const mainList = rawParticipants.slice(0, tournament.maxPlayers);

        const players = mainList.map(p => ({
            id: p.userId || p.id,
            fullName: p.userId ? (p.user?.fullName || null) : p.manualName,
            username: p.userId ? (p.user?.username || null) : p.manualName,
            skillRating: p.userId ? (p.user?.interests?.[0]?.skillRating || 0) : 0,
        }));

        if (players.length < (tournament.minPlayers || 2)) {
            return res.status(400).json({ message: `En az ${tournament.minPlayers || 2} oyuncu gerekli` });
        }

        const mmType = tournament.matchmakingType || 'ELO';
        const freq   = tournament.matchFrequency  || 'FLEXIBLE';
        const daysPerRound = freq === 'WEEKLY_1' ? 7 : freq === 'WEEKLY_2' ? 4 : null;

        const baseDate = tournamentBaseDate(tournament);

        let matches;

        if (tournament.type === '1') {
            // Bireysel Rekabetçi: sadece round 1 oluştur, sonraki turlar dinamik
            matches = eloBasedMatches(players, id, 1);
            const deadline = new Date(baseDate);
            deadline.setDate(deadline.getDate() + 7);
            matches = matches.map(m => ({ ...m, deadline }));
        } else if (tournament.type === '2') {
            // Tek eleme
            const playoffPlayers = mmType === 'RANDOM'
                ? shuffle(players)
                : [...players].sort((a, b) => (b.skillRating || 0) - (a.skillRating || 0));
            matches = singleElimMatches(playoffPlayers, id, 1, 'PLAYOFF');
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

        // Notify real (non-manual) participants
        for (const p of mainList) {
            if (p.userId && p.userId !== req.userId) {
                await createNotification(
                    p.userId, 'TOURNAMENT_STARTED', '🏆 Turnuva Başladı',
                    `"${tournament.name}" turnuvası başladı! Eşleşmelerinizi kontrol edin.`,
                    { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
                );
            }
        }

        const updated = await prisma.tournament.findUnique({
            where: { id },
            include: {
                creator: { select: { id: true, username: true, fullName: true } },
                _count: { select: { participants: { where: { status: 'ACCEPTED' } } } },
            },
        });
        res.json(updated);
    } catch (e) { next(e); }
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
        if (tournament.type === '2') return res.status(400).json({ message: 'Eleme turnuvaları yeniden eşleştirilemez' });

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
        const [tournament, rawMatches] = await Promise.all([
            prisma.tournament.findUnique({ where: { id }, select: { type: true, eventDate: true, eventTime: true } }),
            prisma.tournamentMatch.findMany({ where: { tournamentId: id }, orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }] }),
        ]);

        // Tip '1' turnuvalar: eventDate + round*7 gün baz alınarak yanlış deadline'ları düzelt
        let matches = rawMatches;
        if (tournament?.type === '1' && tournament.eventDate) {
            const base = tournamentBaseDate(tournament);
            const fixes = [];
            matches = rawMatches.map(m => {
                if (m.phase !== 'GROUP' || m.status !== 'PENDING' || !m.round) return m;
                const correct = new Date(base);
                correct.setDate(correct.getDate() + m.round * 7);
                const current = m.deadline ? new Date(m.deadline) : null;
                if (!current || Math.abs(current.getTime() - correct.getTime()) > 60 * 1000) {
                    fixes.push(prisma.tournamentMatch.update({ where: { id: m.id }, data: { deadline: correct } }));
                    return { ...m, deadline: correct };
                }
                return m;
            });
            if (fixes.length > 0) await Promise.all(fixes);
        }

        res.json(matches);
    } catch (e) { next(e); }
};

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
        if (tournament.status !== 'IN_PROGRESS') return res.status(400).json({ message: 'Tournament not in progress' });

        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Match not found' });

        const isCreator = tournament.creatorId === req.userId;
        const isPlayer = match.p1Id === req.userId || match.p2Id === req.userId;
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

        // Apply competitive points — same system as rival matches (totalPoints + skillRating 0-5)
        let p1EloDelta = 0, p2EloDelta = 0;
        let p1RatingBefore = null, p1RatingAfter = null, p2RatingBefore = null, p2RatingAfter = null;
        // If match was already scored, reverse previous ELO before re-applying
        if (match.status === "COMPLETED" && match.score && match.p1Id && match.p2Id) {
            const prev = match.score;
            if (prev.p1EloDelta !== 0 || prev.p2EloDelta !== 0) {
                const prevAllIds = [match.p1Id, match.p2Id];
                const prevInterests = await prisma.userInterest.findMany({
                    where: { userId: { in: prevAllIds }, category: tournament.category, subCategory: tournament.subCategory },
                });
                const p1ir = prevInterests.find(i => i.userId === match.p1Id);
                const p2ir = prevInterests.find(i => i.userId === match.p2Id);
                if (p1ir) {
                    await prisma.userInterest.update({
                        where: { id: p1ir.id },
                        data: {
                            totalPoints: Math.max(0, p1ir.totalPoints - prev.p1EloDelta),
                            wins:   { decrement: prev.p1EloDelta > 0 ? 1 : 0 },
                            losses: { decrement: prev.p1EloDelta < 0 ? 1 : 0 },
                            skillRating: prev.p1RatingBefore ?? p1ir.skillRating,
                        },
                    });
                }
                if (p2ir) {
                    await prisma.userInterest.update({
                        where: { id: p2ir.id },
                        data: {
                            totalPoints: Math.max(0, p2ir.totalPoints - prev.p2EloDelta),
                            wins:   { decrement: prev.p2EloDelta > 0 ? 1 : 0 },
                            losses: { decrement: prev.p2EloDelta < 0 ? 1 : 0 },
                            skillRating: prev.p2RatingBefore ?? p2ir.skillRating,
                        },
                    });
                }
            }
        }

        if (match.p1Id && match.p2Id) {
            const winnerId_e = winner === 'p1' ? match.p1Id : match.p2Id;
            const loserId_e  = winner === 'p1' ? match.p2Id : match.p1Id;
            const allPlayerIds = [match.p1Id, match.p2Id];
            const existing = await prisma.userInterest.findMany({
                where: { userId: { in: allPlayerIds }, category: tournament.category, subCategory: tournament.subCategory },
            });
            const existingIds = new Set(existing.map(i => i.userId));
            const missing = allPlayerIds.filter(id => !existingIds.has(id));
            const created = missing.length > 0
                ? await Promise.all(missing.map(userId =>
                    prisma.userInterest.create({
                        data: { userId, category: tournament.category, subCategory: tournament.subCategory, totalPoints: 0, wins: 0, losses: 0, skillRating: 0 },
                    })
                ))
                : [];
            const interests = [...existing, ...created];
            const wi = interests.find(i => i.userId === winnerId_e);
            const li = interests.find(i => i.userId === loserId_e);
            if (wi && li) {
                const ratingDiff = Math.abs(wi.skillRating - li.skillRating);
                let winnerGames = 0, totalGames = 0;
                for (const s of sets) { winnerGames += winner === 'p1' ? (s.p1||0) : (s.p2||0); totalGames += (s.p1||0) + (s.p2||0); }
                const dominant = totalGames === 0 || (winnerGames / totalGames) > 0.65;
                let transfer;
                if (ratingDiff >= 2.0)        transfer = dominant ? 7 : 6;
                else if (ratingDiff >= 1.0)   transfer = dominant ? 5 : 4;
                else if (ratingDiff >= 0.5)   transfer = dominant ? 4 : 3;
                else if (ratingDiff >= 0.25)  transfer = dominant ? 3 : 2;
                else if (ratingDiff >= 0.10)  transfer = dominant ? 2 : 1;
                else                          transfer = dominant ? 1 : 0.5;

                const divisor = tournament.type === "1" ? 2 : 1;
                const ratingStep = parseFloat((transfer * 0.05 / divisor).toFixed(3));
                const wRatingAfter = Math.min(5, parseFloat((wi.skillRating + ratingStep).toFixed(3)));
                const lRatingAfter = Math.max(0, parseFloat((li.skillRating - ratingStep).toFixed(3)));

                await Promise.all([
                    prisma.userInterest.update({ where: { id: wi.id }, data: { totalPoints: wi.totalPoints + transfer, wins: wi.wins + 1, skillRating: wRatingAfter } }),
                    prisma.userInterest.update({ where: { id: li.id }, data: { totalPoints: Math.max(0, li.totalPoints - transfer), losses: li.losses + 1, skillRating: lRatingAfter } }),
                ]);

                const p1i = interests.find(i => i.userId === match.p1Id);
                const p2i = interests.find(i => i.userId === match.p2Id);
                p1RatingBefore = p1i.skillRating;
                p2RatingBefore = p2i.skillRating;
                p1RatingAfter  = winner === 'p1' ? wRatingAfter : lRatingAfter;
                p2RatingAfter  = winner === 'p2' ? wRatingAfter : lRatingAfter;
                p1EloDelta = winner === 'p1' ? +transfer : -transfer;
                p2EloDelta = winner === 'p2' ? +transfer : -transfer;
            }
        }

        const score = { sets, winner, p1Sets, p2Sets, p1Games, p2Games, p1EloDelta, p2EloDelta, p1RatingBefore, p1RatingAfter, p2RatingBefore, p2RatingAfter };

        await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: { score, status: 'COMPLETED', winnerId },
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
            }
        }

        // Bireysel Rekabetçi (type '1'): dinamik tur yönetimi
        if (tournament.type === '1' && match.phase === 'GROUP') {
            const allGroupMatches = await prisma.tournamentMatch.findMany({
                where: { tournamentId: id, phase: 'GROUP' },
            });
            const currentRoundMatches = allGroupMatches.filter(m => m.round === match.round);
            const currentRoundDone = currentRoundMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE' || m.status === 'FORFEIT');

            if (currentRoundDone) {
                const maxRound = Math.max(...allGroupMatches.map(m => m.round));
                const matchesPerPlayer = tournament.matchesBeforePlayoff || Math.min(tournament.participants.length - 1, 3);
                const existingPlayoff = await prisma.tournamentMatch.findFirst({
                    where: { tournamentId: id, phase: 'PLAYOFF' },
                });

                if (maxRound < matchesPerPlayer && !existingPlayoff) {
                    // Sonraki GROUP turunu güncel ELO ile oluştur
                    const playedPairKeys = allGroupMatches
                        .filter(m => m.p1Id && m.p2Id)
                        .map(m => [m.p1Id, m.p2Id].sort().join('|'));
                    const nextRoundMatches = await generateNextEloRound(tournament, maxRound + 1, playedPairKeys);
                    if (nextRoundMatches.length > 0) {
                        await prisma.tournamentMatch.createMany({ data: nextRoundMatches });
                    }
                } else if (!existingPlayoff) {
                    // Tüm GROUP turları bitti → playoff oluştur (ELO sıralaması + averaj tiebreaker)
                    const players = tournament.participants.map(p => ({
                        id: p.userId, fullName: p.user.fullName, username: p.user.username, skillRating: 0,
                    }));
                    const standings = computeStandings(players, allGroupMatches, '1');
                    const qualifiers = tournament.playoffQualifiers || 4;
                    const topStandings = standings.slice(0, Math.min(qualifiers, standings.length));

                    // Play-off eşleşmesi: ELO puanına en yakın oyuncular (Rule 2)
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
                    const topPlayers = topParticipants.map(p => ({
                        id: p.userId,
                        fullName: p.user?.fullName || null,
                        username: p.user?.username || null,
                        skillRating: p.user?.interests?.[0]?.skillRating || 0,
                    })).sort((a, b) => (b.skillRating || 0) - (a.skillRating || 0));

                    if (topPlayers.length >= 2) {
                        const playoffData = singleElimMatches(topPlayers, id, maxRound + 1, 'PLAYOFF');
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
                        }
                    }
                }
            }
        }

        // Auto-complete tournament when no PENDING matches remain
        const pendingCount = await prisma.tournamentMatch.count({
            where: { tournamentId: id, status: 'PENDING' },
        });
        if (pendingCount === 0) {
            await prisma.tournament.update({
                where: { id },
                data: { status: 'COMPLETED', completedAt: new Date() },
            });
        }

        const allMatches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });
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

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı.' });
        if (tournament.type !== '1') return res.status(400).json({ message: 'Joker hakkı sadece Bireysel Rekabetçi turnuvalarda kullanılabilir.' });

        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Maç bulunamadı.' });
        if (match.status !== 'PENDING') return res.status(400).json({ message: 'Bu maç zaten tamamlanmış.' });

        const isP1 = match.p1Id === req.userId;
        const isP2 = match.p2Id === req.userId;
        if (!isP1 && !isP2) return res.status(403).json({ message: 'Bu maçta yer almıyorsunuz.' });

        const participant = await prisma.tournamentParticipant.findFirst({
            where: { tournamentId: id, userId: req.userId, status: 'ACCEPTED' },
        });
        if (!participant) return res.status(404).json({ message: 'Katılımcı bulunamadı.' });
        if (participant.jokerUsed) return res.status(400).json({ message: 'Joker hakkınızı daha önce kullandınız.' });

        const otherJokerRequested = isP1 ? match.p2JokerRequested : match.p1JokerRequested;
        const newDeadline = new Date(match.deadline || new Date());
        newDeadline.setDate(newDeadline.getDate() + 7);

        if (otherJokerRequested) {
            // Karşılıklı joker (Rule 4): +7 gün, hiçbiri tüketilmez
            await prisma.tournamentMatch.update({
                where: { id: matchId },
                data: { p1JokerRequested: false, p2JokerRequested: false, deadline: newDeadline },
            });
            return res.json({ mutual: true, message: 'Karşılıklı joker kabul edildi — deadline 7 gün uzatıldı, joker hakkınız korundu.', deadline: newDeadline });
        } else {
            // Tek joker: +7 gün, joker tükenir
            const field = isP1 ? 'p1JokerRequested' : 'p2JokerRequested';
            await prisma.$transaction([
                prisma.tournamentMatch.update({
                    where: { id: matchId },
                    data: { [field]: true, deadline: newDeadline },
                }),
                prisma.tournamentParticipant.update({
                    where: { id: participant.id },
                    data: { jokerUsed: true, jokerUsedAt: new Date() },
                }),
            ]);
            return res.json({ mutual: false, message: 'Joker hakkınız kullanıldı — deadline 7 gün uzatıldı.', deadline: newDeadline });
        }
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

        res.json(all);
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
        const request = await prisma.tournamentPermissionRequest.findUnique({ where: { userId: req.userId }, select: { status: true } });
        res.json({ status: request?.status || 'NONE' });
    } catch (e) { next(e); }
};
