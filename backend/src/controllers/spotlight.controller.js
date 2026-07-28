import prisma from '../config/prisma.js';

function dayRangeUTC(daysAgo) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
    const end = new Date(start.getTime() + 24 * 3600 * 1000);
    return { start, end };
}

// Mirrors achievement.controller.js's per-user placement detection, but resolves
// all top-3 finishers of a single tournament directly instead of checking one user.
async function getTournamentTop3(tournament) {
    const results = [];
    const playoffMatches = await prisma.tournamentMatch.findMany({
        where: { tournamentId: tournament.id, phase: 'PLAYOFF', status: { in: ['COMPLETED', 'FORFEIT'] } },
        orderBy: { round: 'desc' },
    });

    if (playoffMatches.length > 0) {
        const maxRound = playoffMatches[0].round;
        const final = playoffMatches.find(m => m.round === maxRound);
        if (final?.winnerId) {
            const winnerIsP1 = final.winnerId === final.p1Id;
            const loserId = winnerIsP1 ? final.p2Id : final.p1Id;
            const loserName = winnerIsP1 ? final.p2Name : final.p1Name;
            results.push({ userId: final.winnerId, name: winnerIsP1 ? final.p1Name : final.p2Name, placement: 1 });
            if (loserId) results.push({ userId: loserId, name: loserName, placement: 2 });

            const semiFinals = playoffMatches.filter(m => m.round === maxRound - 1);
            for (const sf of semiFinals) {
                const sfLoserId = sf.winnerId === sf.p1Id ? sf.p2Id : sf.p1Id;
                const sfLoserName = sf.winnerId === sf.p1Id ? sf.p2Name : sf.p1Name;
                if (sfLoserId && sfLoserId !== loserId) {
                    results.push({ userId: sfLoserId, name: sfLoserName, placement: 3 });
                }
            }
        }
    }

    if (results.length === 0 && tournament.bracketData) {
        try {
            const bd = typeof tournament.bracketData === 'string' ? JSON.parse(tournament.bracketData) : tournament.bracketData;
            const standings = Array.isArray(bd) ? bd : (bd?.standings || bd?.groupStandings || []);
            standings.slice(0, 3).forEach((s, idx) => {
                results.push({ userId: s.userId, name: s.username || s.fullName || s.name, placement: idx + 1 });
            });
        } catch { /* ignore malformed bracketData */ }
    }

    return results;
}

// Top-3 finisher of a tournament with the given scope that completed yesterday, if any.
async function getYesterdayTournamentTop3(subCategory, scope) {
    const { start, end } = dayRangeUTC(1);
    const tournament = await prisma.tournament.findFirst({
        where: { subCategory, scope, status: 'COMPLETED', completedAt: { gte: start, lt: end } },
        orderBy: { completedAt: 'desc' },
    });
    if (!tournament) return null;

    const top3 = await getTournamentTop3(tournament);
    if (top3.length === 0) return null;
    const winner = top3.find(p => p.placement === 1) || top3[0];

    return {
        type: 'tournament',
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        userId: winner.userId,
        name: winner.name,
        placement: winner.placement,
        top3,
        date: tournament.completedAt,
    };
}

// User with the most confirmed rival-match wins yesterday, optionally scoped to a city.
async function getYesterdayMostWins(subCategory, city) {
    const { start, end } = dayRangeUTC(1);
    const matches = await prisma.activityRequest.findMany({
        where: {
            subCategory,
            status: 'COMPLETED',
            scoreStatus: 'CONFIRMED',
            matchDate: { gte: start, lt: end },
            ...(city ? { location: { contains: city, mode: 'insensitive' } } : {}),
        },
        select: {
            senderId: true, participants: true, score: true,
            sender: { select: { id: true, username: true, fullName: true } },
        },
    });

    const wins = {}; // userId -> { count, name }
    for (const m of matches) {
        const winnerSide = m.score?.winner;
        if (winnerSide !== 'sender' && winnerSide !== 'opponent') continue;
        const parts = Array.isArray(m.participants) ? m.participants : [];
        const winnerId   = winnerSide === 'sender' ? m.senderId : parts[0]?.id;
        const winnerName = winnerSide === 'sender' ? (m.sender?.fullName || m.sender?.username) : (parts[0]?.fullName || parts[0]?.username);
        if (!winnerId) continue;
        wins[winnerId] = wins[winnerId] || { count: 0, name: winnerName };
        wins[winnerId].count++;
    }

    const top = Object.entries(wins).sort((a, b) => b[1].count - a[1].count)[0];
    if (!top) return null;
    const [userId, info] = top;
    return { type: 'most_wins', userId, name: info.name, wins: info.count, date: start };
}

// Padel gibi çiftler branşlarında galibiyet tek oyuncuya değil kazanan İKİLİYE ait sayılır —
// o maçtaki takım (sender+partner ya da opp1+opp2) birlikte "günün padelcıları" adayı olur.
async function getYesterdayMostWinsTeam(subCategory, city) {
    const { start, end } = dayRangeUTC(1);
    const matches = await prisma.activityRequest.findMany({
        where: {
            subCategory,
            matchType: 'DOUBLE',
            status: 'COMPLETED',
            scoreStatus: 'CONFIRMED',
            matchDate: { gte: start, lt: end },
            ...(city ? { location: { contains: city, mode: 'insensitive' } } : {}),
        },
        select: {
            senderId: true, senderTeam: true, participants: true, score: true,
            founderTeamName: true, opponentTeamName: true,
            sender: { select: { id: true, username: true, fullName: true } },
        },
    });

    const wins = {}; // teamKey -> { count, names, teamName }
    for (const m of matches) {
        const winnerSide = m.score?.winner;
        if (winnerSide !== 'sender' && winnerSide !== 'opponent') continue;
        const senderTeamArr = Array.isArray(m.senderTeam) ? m.senderTeam : [];
        const parts = Array.isArray(m.participants) ? m.participants : [];

        let teamIds, teamNames, teamName;
        if (winnerSide === 'sender') {
            const partner = senderTeamArr[0];
            teamIds = [m.senderId, partner?.id].filter(Boolean);
            teamNames = [m.sender?.fullName || m.sender?.username, partner?.fullName || partner?.username].filter(Boolean);
            teamName = m.founderTeamName;
        } else {
            teamIds = [parts[0]?.id, parts[1]?.id].filter(Boolean);
            teamNames = [parts[0]?.fullName || parts[0]?.username, parts[1]?.fullName || parts[1]?.username].filter(Boolean);
            teamName = m.opponentTeamName;
        }
        if (teamNames.length < 2) continue; // takım eksikse (partner/rakip verisi yoksa) sayma

        const key = teamIds.length === 2 ? teamIds.slice().sort().join('|') : teamNames.slice().sort().join('|');
        wins[key] = wins[key] || { count: 0, names: teamNames, teamName };
        wins[key].count++;
    }

    const top = Object.entries(wins).sort((a, b) => b[1].count - a[1].count)[0];
    if (!top) return null;
    const [, info] = top;
    return { type: 'most_wins', name: info.teamName || info.names.join(' & '), wins: info.count, date: start };
}

export const getDailySpotlight = async (req, res, next) => {
    try {
        const { subCategory = 'tennis' } = req.query;
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { city: true } });
        const mostWins = subCategory === 'padel' ? getYesterdayMostWinsTeam : getYesterdayMostWins;

        const [internationalTournament, nationalTournament, localTournament] = await Promise.all([
            getYesterdayTournamentTop3(subCategory, 'ULUSLARARASI'),
            getYesterdayTournamentTop3(subCategory, 'ULUSAL'),
            getYesterdayTournamentTop3(subCategory, 'YEREL'),
        ]);

        // O katmanda dün biten bir turnuva yoksa, Yerel'deki gibi en çok galibiyet
        // alan oyuncunun/takımın adı fallback olarak gösterilir — kart hiçbir zaman boş kalmaz.
        const [international, national, local] = await Promise.all([
            internationalTournament ? Promise.resolve(internationalTournament) : mostWins(subCategory),
            nationalTournament ? Promise.resolve(nationalTournament) : mostWins(subCategory),
            localTournament ? Promise.resolve(localTournament) : mostWins(subCategory, me?.city),
        ]);

        res.json({
            pro: { available: false }, // RapidAPI tennis-data integration pending
            app: { international, national, local },
        });
    } catch (error) { next(error); }
};
