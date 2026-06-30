import prisma from '../config/prisma.js';
import { emitToUser } from '../config/socket.js';
import { createNotification } from '../controllers/notification.controller.js';

// ELO is already applied when the score is entered (enterTournamentMatchScore) — confirmation
// just locks the score against further correction. If the opposing side doesn't confirm/dispute
// within 1h, auto-confirm so the "Düzelt" button clears and the result locks in.
async function autoConfirmTournamentScores() {
    try {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000);

        const pending = await prisma.tournamentMatch.findMany({
            where: {
                status: 'COMPLETED',
                AND: [
                    { OR: [{ p1Confirmed: false }, { p2Confirmed: false }] },
                    // scoreSubmittedAt is null for matches scored before this field existed —
                    // treat those as already past the 1h window too, not exempt forever.
                    { OR: [{ scoreSubmittedAt: { lte: cutoff } }, { scoreSubmittedAt: null }] },
                ],
            },
        });

        if (pending.length === 0) return;

        const tournamentIds = [...new Set(pending.map(m => m.tournamentId))];
        const teamIds = [...new Set(pending.flatMap(m => [m.p1Id, m.p2Id]).filter(Boolean))];
        const teams = await prisma.tournamentTeam.findMany({ where: { id: { in: teamIds } } });
        const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));

        await prisma.tournamentMatch.updateMany({
            where: { id: { in: pending.map(m => m.id) } },
            data: { p1Confirmed: true, p2Confirmed: true },
        });

        for (const tid of tournamentIds) {
            const allMatches = await prisma.tournamentMatch.findMany({
                where: { tournamentId: tid },
                orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
            });
            const matchesForThisTournament = pending.filter(m => m.tournamentId === tid);
            const memberIds = new Set();
            for (const m of matchesForThisTournament) {
                const t1 = teamMap[m.p1Id], t2 = teamMap[m.p2Id];
                for (const uid of [t1 ? t1.player1Id : m.p1Id, t1 ? t1.player2Id : null, t2 ? t2.player1Id : m.p2Id, t2 ? t2.player2Id : null]) {
                    if (uid) memberIds.add(uid);
                }
            }
            for (const uid of memberIds) {
                emitToUser(uid, 'tournament:match_scored', { tournamentId: tid, matches: allMatches });
                createNotification(
                    uid, 'SCORE_CONFIRMED',
                    '⏱️ Skor otomatik onaylandı',
                    'Rakip 1 saat içinde skoru onaylamadı, skor otomatik olarak onaylandı.',
                    { tournamentId: tid }
                ).catch(() => {});
            }
        }

        console.log(`[autoConfirmTournamentScores] Auto-confirmed ${pending.length} tournament match score(s)`);
    } catch (err) {
        console.error('[autoConfirmTournamentScores] Error:', err.message);
    }
}

async function cleanupExpiredTournaments() {
    try {
        const now = new Date();

        const open = await prisma.tournament.findMany({
            where: { status: 'OPEN', eventDate: { not: null } },
            select: { id: true, eventDate: true },
        });

        // Cancel only after the full event day has passed (next day 03:00 UTC = next day 06:00 Turkey)
        const expiredIds = open
            .filter(t => {
                const expiry = new Date(t.eventDate);
                expiry.setUTCDate(expiry.getUTCDate() + 1);
                expiry.setUTCHours(3, 0, 0, 0);
                return expiry.getTime() < now.getTime();
            })
            .map(t => t.id);

        if (expiredIds.length > 0) {
            const result = await prisma.tournament.updateMany({
                where: { id: { in: expiredIds } },
                data: { status: 'CANCELLED' },
            });
            console.log(`[cleanup-tournaments] Cancelled ${result.count} expired unstarted tournament(s)`);
        }
    } catch (err) {
        console.error('[cleanup-tournaments] Error:', err.message);
    }
}

export function startTournamentCleanupJob() {
    cleanupExpiredTournaments();
    autoConfirmTournamentScores();
    setInterval(cleanupExpiredTournaments, 2 * 60 * 1000); // every 2 minutes
    setInterval(autoConfirmTournamentScores, 5 * 60 * 1000); // every 5 minutes, 1h timeout
    console.log('🧹 Tournament cleanup job started (every 2 min)');
    console.log('⏰ Tournament auto-confirm score job started (every 5 min, 1h timeout)');
}
