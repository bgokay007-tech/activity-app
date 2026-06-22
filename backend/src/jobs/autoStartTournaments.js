import prisma from '../config/prisma.js';
import { runStartTournament, tournamentBaseDate } from '../controllers/tournament.controller.js';

async function autoStartDueTournaments() {
    try {
        const now = new Date();

        const candidates = await prisma.tournament.findMany({
            where: { status: 'OPEN', eventDate: { not: null }, maxPlayers: { not: null } },
        });

        const due = candidates.filter(t => tournamentBaseDate(t).getTime() <= now.getTime());

        for (const tournament of due) {
            const acceptedCount = await prisma.tournamentParticipant.count({
                where: { tournamentId: tournament.id, status: 'ACCEPTED' },
            });
            if (acceptedCount < (tournament.minPlayers || 2)) continue;

            try {
                await runStartTournament(tournament, { actorUserId: null });
                console.log(`[auto-start] Started tournament ${tournament.id} (${tournament.name})`);
            } catch (err) {
                console.error(`[auto-start] Failed to start tournament ${tournament.id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[auto-start] Error:', err.message);
    }
}

export function startTournamentAutoStartJob() {
    autoStartDueTournaments();
    setInterval(autoStartDueTournaments, 60 * 1000); // every 1 minute
    console.log('🏁 Tournament auto-start job started (every 1 min)');
}
