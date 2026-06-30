import prisma from '../config/prisma.js';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Bir kullanıcının (veya Çiftler Rekabetçi'de takımının) belirli bir turnuvadaki
// yerleşimini hesaplar: playoff finaline/yarı finaline bakar, yoksa bracketData
// standings'e düşer. Hem achievement listesinde hem de arşiv listesinde kullanılır.
export async function computeTournamentPlacement(tournamentId, userId, bracketData) {
    let placement = null;

    // Çiftler Rekabetçi: bu kullanıcının takımının id'sini bul — maçlarda p1Id/p2Id/winnerId
    // kullanıcı değil takım id'sidir.
    let effectiveId = userId;
    const myTeam = await prisma.tournamentTeam.findFirst({
        where: { tournamentId, OR: [{ player1Id: userId }, { player2Id: userId }] },
    });
    if (myTeam) effectiveId = myTeam.id;

    // Playoff maçlarına bak
    const playoffMatches = await prisma.tournamentMatch.findMany({
        where: { tournamentId, phase: 'PLAYOFF', status: { in: ['COMPLETED', 'FORFEIT'] } },
        orderBy: { round: 'desc' },
    });

    if (playoffMatches.length > 0) {
        const maxRound = playoffMatches[0].round;
        const final = playoffMatches.find(m => m.round === maxRound);
        if (final) {
            if (final.winnerId === effectiveId) placement = 1;
            else if (final.p1Id === effectiveId || final.p2Id === effectiveId) placement = 2;
        }
        if (!placement) {
            // Yarı finalde elendiyse → 3.
            const semiFinals = playoffMatches.filter(m => m.round === maxRound - 1);
            const lostSemi = semiFinals.find(m =>
                (m.p1Id === effectiveId || m.p2Id === effectiveId) && m.winnerId !== effectiveId
            );
            if (lostSemi) placement = 3;
        }
    }

    // Playoff yoksa bracketData standings'e bak
    if (!placement && bracketData) {
        try {
            const bd = typeof bracketData === 'string' ? JSON.parse(bracketData) : bracketData;
            const standings = Array.isArray(bd) ? bd : (bd?.standings || bd?.groupStandings || []);
            const idx = standings.findIndex(s => s.userId === effectiveId);
            if (idx >= 0 && idx < 3) placement = idx + 1;
        } catch {}
    }

    return { placement, myTeam };
}

async function getTournamentPlacements(userId) {
    // Kullanıcının katıldığı tamamlanmış turnuvalar
    const tournaments = await prisma.tournament.findMany({
        where: {
            status: 'COMPLETED',
            participants: { some: { userId, status: 'ACCEPTED' } },
        },
        select: {
            id: true, name: true, subCategory: true, category: true,
            scope: true, completedAt: true, bracketData: true,
        },
        orderBy: { completedAt: 'desc' },
    });

    const placements = [];

    for (const t of tournaments) {
        const { placement, myTeam } = await computeTournamentPlacement(t.id, userId, t.bracketData);

        if (placement) {
            placements.push({
                tournamentId: t.id,
                name: t.name,
                subCategory: t.subCategory,
                category: t.category,
                scope: t.scope,
                placement,
                medal: MEDAL[placement] || '',
                partnerName: myTeam ? (myTeam.player1Id === userId ? myTeam.player2Name : myTeam.player1Name) : null,
                completedAt: t.completedAt,
            });
        }
    }

    return placements;
}

export const getAchievements = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const [tournamentPlacements, custom] = await Promise.all([
            getTournamentPlacements(userId),
            prisma.userAchievement.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
            }),
        ]);
        res.json({ tournament: tournamentPlacements, custom });
    } catch (e) { next(e); }
};

export const addAchievement = async (req, res, next) => {
    try {
        const { title, description, proofUrl, achievedAt } = req.body;
        if (!title?.trim()) return res.status(400).json({ message: 'Başlık zorunludur' });
        const achievement = await prisma.userAchievement.create({
            data: { userId: req.userId, title: title.trim(), description: description?.trim() || null, proofUrl: proofUrl || null, achievedAt: achievedAt || null },
        });
        res.status(201).json(achievement);
    } catch (e) { next(e); }
};

export const deleteAchievement = async (req, res, next) => {
    try {
        const { id } = req.params;
        const item = await prisma.userAchievement.findUnique({ where: { id } });
        if (!item) return res.status(404).json({ message: 'Bulunamadı' });
        if (item.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.userAchievement.delete({ where: { id } });
        res.json({ ok: true });
    } catch (e) { next(e); }
};
