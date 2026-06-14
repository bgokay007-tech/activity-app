import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';

// ─── Tournament bracket helpers ───────────────────────────────────────────────

function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

/** Round-robin schedule using circle method */
function roundRobinMatches(players, tournamentId, phase = 'GROUP') {
    const list = [...players];
    if (list.length % 2 !== 0) list.push(null); // null = BYE
    const n = list.length;
    const matches = [];
    for (let r = 0; r < n - 1; r++) {
        for (let k = 0; k < n / 2; k++) {
            const p1 = list[k], p2 = list[n - 1 - k];
            const isBye = !p1 || !p2;
            const real = p1 || p2;
            matches.push({
                tournamentId, round: r + 1, phase, matchIndex: k,
                p1Id:   isBye ? null : p1?.id,   p1Name: isBye ? null : (p1?.fullName || p1?.username),
                p2Id:   isBye ? null : p2?.id,   p2Name: isBye ? null : (p2?.fullName || p2?.username),
                status:   isBye ? 'BYE' : 'PENDING',
                winnerId: isBye ? real?.id : null,
            });
        }
        list.splice(1, 0, list.pop()); // rotate — keep list[0] fixed
    }
    return matches;
}

/** Single-elimination bracket — all rounds pre-created with TBD slots */
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

/** Compute GROUP-phase standings from completed matches */
function computeStandings(players, matches) {
    const stats = {};
    for (const p of players) {
        stats[p.id] = { userId: p.id, name: p.fullName || p.username, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 0 };
    }
    for (const m of matches) {
        if (m.status !== 'COMPLETED' || !m.score || m.phase !== 'GROUP') continue;
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
        const sr = (x) => x.setsWon / Math.max(1, x.setsWon + x.setsLost);
        if (Math.abs(sr(b) - sr(a)) > 0.001) return sr(b) - sr(a);
        const gr = (x) => x.gamesWon / Math.max(1, x.gamesWon + x.gamesLost);
        return gr(b) - gr(a);
    });
}

export const createTournament = async (req, res, next) => {
    try {
        const {
            name, type, category, subCategory, description,
            scope, genderType, isPaid, prize1, prize2, prize3, contactPhone,
            minPlayers, maxPlayers,
            setsPerMatch, advantageScoring, matchesBeforePlayoff, playoffQualifiers,
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
                prize1: prize1 || null,
                prize2: prize2 || null,
                prize3: prize3 || null,
                contactPhone: contactPhone || null,
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
                creatorId: req.userId,
                status: 'OPEN',
            },
            include: {
                creator: { select: { id: true, username: true, fullName: true } },
                _count: { select: { participants: { where: { status: 'ACCEPTED' } } } },
            },
        });
        res.status(201).json(tournament);
    } catch (e) { next(e); }
};

export const getTournaments = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;

        // Auto-delete expired OPEN tournaments
        const now = new Date();
        await prisma.tournament.deleteMany({
            where: {
                status: 'OPEN',
                OR: [
                    { endDate:   { lt: now } },
                    { eventDate: { lt: now } },
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
        if (tournament.status !== 'OPEN') return res.status(400).json({ message: 'Tournament is not open for join requests' });

        const existing = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });
        if (existing) return res.status(400).json({ message: 'You already sent a join request' });

        const isCreator = tournament.creatorId === req.userId;
        const participant = await prisma.tournamentParticipant.create({
            data: { tournamentId: id, userId: req.userId, note, status: isCreator ? 'ACCEPTED' : 'PENDING' },
            include: { user: { select: { id: true, username: true, fullName: true } } },
        });

        if (!isCreator) {
            await createNotification(
                tournament.creatorId,
                'TOURNAMENT_JOIN',
                '🎾 New Join Request',
                `${participant.user.fullName || participant.user.username} wants to join "${tournament.name}"`,
                { tournamentId: id, userId: req.userId, category: tournament.category.toLowerCase(), subCategory: tournament.subCategory },
            );
        }

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
            orderBy: { createdAt: 'asc' },
        });
        res.json(participants);
    } catch (e) { next(e); }
};

export const updateJoinRequest = async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        const { status } = req.body; // ACCEPTED | REJECTED

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not your tournament' });

        const updated = await prisma.tournamentParticipant.update({
            where: { tournamentId_userId: { tournamentId: id, userId } },
            data: { status },
            include: { user: { select: { id: true, username: true } } },
        });
        res.json(updated);
    } catch (e) { next(e); }
};

export const cancelJoin = async (req, res, next) => {
    try {
        const { id } = req.params;

        const existing = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });
        if (!existing) return res.status(404).json({ message: 'Not registered' });

        const wasAccepted = existing.status === 'ACCEPTED';

        await prisma.tournamentParticipant.delete({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });

        // Freed an accepted slot → promote first PENDING in queue
        if (wasAccepted) {
            const nextUp = await prisma.tournamentParticipant.findFirst({
                where: { tournamentId: id, status: 'PENDING' },
                orderBy: { createdAt: 'asc' },
            });
            if (nextUp) {
                await prisma.tournamentParticipant.update({
                    where: { tournamentId_userId: { tournamentId: id, userId: nextUp.userId } },
                    data: { status: 'ACCEPTED' },
                });
                const tourn = await prisma.tournament.findUnique({
                    where: { id },
                    select: { name: true, category: true, subCategory: true },
                });
                await createNotification(
                    nextUp.userId,
                    'TOURNAMENT_JOIN_ACCEPTED',
                    '🎉 Turnuvaya Kabul Edildiniz',
                    `"${tourn.name}" turnuvasına yedek listesinden kabul edildiniz`,
                    { tournamentId: id, category: tourn.category.toLowerCase(), subCategory: tourn.subCategory },
                );
            }
        }

        res.json({ message: 'Registration cancelled' });
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
            '⚠️ Late Cancellation Request',
            `${user.fullName || user.username} wants to cancel their registration for "${tournament.name}" (less than 24h before start)`,
            { tournamentId: id, userId: req.userId, category: tournament.category.toLowerCase(), subCategory: tournament.subCategory },
        );
        res.json({ message: 'Cancellation request sent to creator' });
    } catch (e) { next(e); }
};

export const updateTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { minPlayers, maxPlayers, setsPerMatch, advantageScoring, matchesBeforePlayoff, playoffQualifiers,
                eventDate, eventTime, eventEndDate, eventEndTime } = req.body;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not authorized' });
        const updated = await prisma.tournament.update({
            where: { id },
            data: {
                ...(minPlayers           !== undefined && { minPlayers: parseInt(minPlayers) }),
                ...(maxPlayers           !== undefined && { maxPlayers: parseInt(maxPlayers) }),
                ...(setsPerMatch         !== undefined && { setsPerMatch: setsPerMatch ? parseInt(setsPerMatch) : null }),
                ...(advantageScoring     !== undefined && { advantageScoring: advantageScoring === true }),
                ...(matchesBeforePlayoff !== undefined && { matchesBeforePlayoff: matchesBeforePlayoff ? parseInt(matchesBeforePlayoff) : null }),
                ...(playoffQualifiers    !== undefined && { playoffQualifiers: playoffQualifiers ? parseInt(playoffQualifiers) : null }),
                ...(eventDate    !== undefined && { eventDate:    eventDate ? new Date(eventDate) : null }),
                ...(eventTime    !== undefined && { eventTime:    eventTime || null }),
                ...(eventEndDate !== undefined && { eventEndDate: eventEndDate ? new Date(eventEndDate) : null }),
                ...(eventEndTime !== undefined && { eventEndTime: eventEndTime || null }),
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
            const interest = p.user.interests[0];
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
            orderBy: { createdAt: 'asc' },
        });

        const players = rawParticipants.map(p => ({
            id: p.userId,
            fullName: p.user.fullName,
            username: p.user.username,
            skillRating: p.user.interests[0]?.skillRating || 0,
        }));

        if (players.length < (tournament.minPlayers || 2)) {
            return res.status(400).json({ message: `En az ${tournament.minPlayers || 2} oyuncu gerekli` });
        }

        let matches;
        if (tournament.type === '2') {
            matches = singleElimMatches(players, id, 1, 'PLAYOFF');
        } else {
            matches = roundRobinMatches(players, id, 'GROUP');
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

        // Notify all participants
        for (const p of players) {
            if (p.id !== req.userId) {
                await createNotification(
                    p.id, 'TOURNAMENT_STARTED', '🏆 Turnuva Başladı',
                    `"${tournament.name}" turnuvası başladı! Eşleşmelerinizi kontrol edin.`,
                    { tournamentId: id, category: tournament.category.toLowerCase(), subCategory: tournament.subCategory },
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

export const getTournamentMatches = async (req, res, next) => {
    try {
        const { id } = req.params;
        const matches = await prisma.tournamentMatch.findMany({
            where: { tournamentId: id },
            orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
        });
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
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not authorized' });
        if (tournament.status !== 'IN_PROGRESS') return res.status(400).json({ message: 'Tournament not in progress' });

        const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
        if (!match || match.tournamentId !== id) return res.status(404).json({ message: 'Match not found' });

        let p1Sets = 0, p2Sets = 0, p1Games = 0, p2Games = 0;
        for (const s of sets) {
            p1Games += s.p1 || 0; p2Games += s.p2 || 0;
            if ((s.p1 || 0) > (s.p2 || 0)) p1Sets++; else if ((s.p2 || 0) > (s.p1 || 0)) p2Sets++;
        }
        const winnerId = winner === 'p1' ? match.p1Id : match.p2Id;
        const score = { sets, winner, p1Sets, p2Sets, p1Games, p2Games };

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

        // For type 1 (RR + Playoff): once all GROUP matches done, generate playoff bracket
        if (tournament.type === '1' && match.phase === 'GROUP') {
            const groupMatches = await prisma.tournamentMatch.findMany({
                where: { tournamentId: id, phase: 'GROUP' },
            });
            const allGroupDone = groupMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE');
            const existingPlayoff = await prisma.tournamentMatch.findFirst({
                where: { tournamentId: id, phase: 'PLAYOFF' },
            });

            if (allGroupDone && !existingPlayoff) {
                const players = tournament.participants.map(p => ({
                    id: p.userId, fullName: p.user.fullName, username: p.user.username, skillRating: 0,
                }));
                const standings = computeStandings(players, groupMatches);
                const qualifiers = tournament.playoffQualifiers || 4;
                const topPlayers = standings.slice(0, Math.min(qualifiers, standings.length)).map(s => ({
                    id: s.userId, fullName: s.name, username: s.name, skillRating: 0,
                }));

                if (topPlayers.length >= 2) {
                    const maxRound = Math.max(...groupMatches.map(m => m.round));
                    const playoffData = singleElimMatches(topPlayers, id, maxRound + 1, 'PLAYOFF');
                    await prisma.tournamentMatch.createMany({ data: playoffData });

                    // Auto-advance BYEs in first playoff round
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

export const getArchivedTournaments = async (req, res, next) => {
    try {
        const { category, subCategory, city, dateFrom, dateTo } = req.query;
        const myId = req.userId;

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
        };

        const all = await prisma.tournament.findMany({
            where,
            include: {
                creator:      { select: { id: true, username: true, fullName: true } },
                participants: { where: { userId: myId }, select: { userId: true } },
            },
            orderBy: { completedAt: 'desc' },
        });

        const mine = all.filter(t => t.creatorId === myId || t.participants.length > 0);
        res.json(mine);
    } catch (e) { next(e); }
};
