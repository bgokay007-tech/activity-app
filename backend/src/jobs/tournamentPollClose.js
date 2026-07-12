import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { emitToUser } from '../config/socket.js';
import { tournamentPollDeadline } from '../controllers/tournament.controller.js';

async function closeDuePolls() {
    try {
        const now = new Date();
        const polls = await prisma.tournament.findMany({ where: { status: 'POLL' } });
        const due = polls.filter(t => tournamentPollDeadline(t).getTime() <= now.getTime());

        for (const tournament of due) {
            try {
                const tallies = await prisma.tournamentTypeVote.groupBy({
                    by: ['votedType'],
                    where: { tournamentId: tournament.id },
                    _count: { id: true },
                });
                const c1 = tallies.find(x => x.votedType === '1')?._count.id || 0;
                const c2 = tallies.find(x => x.votedType === '2')?._count.id || 0;
                const winner = c2 > c1 ? '2' : '1'; // eşitlik veya oy yoksa Tür 1 (Bireysel Rekabetçi) kazanır

                await prisma.tournament.update({
                    where: { id: tournament.id },
                    data: { type: winner, status: 'OPEN' },
                });

                createNotification(
                    tournament.creatorId,
                    'TOURNAMENT_POLL_CLOSED',
                    '🗳️ Anket sonuçlandı',
                    `"${tournament.name}" turnuvasında kazanan tür belirlendi, kayıtlar açıldı.`,
                    { tournamentId: tournament.id }
                ).catch(() => {});
                emitToUser(tournament.creatorId, 'tournament:poll_closed', { tournamentId: tournament.id, winner });

                console.log(`[poll-close] Tournament ${tournament.id} resolved to type ${winner}`);
            } catch (err) {
                console.error(`[poll-close] Failed for ${tournament.id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[poll-close] Error:', err.message);
    }
}

export function startTournamentPollCloseJob() {
    closeDuePolls();
    setInterval(closeDuePolls, 60 * 1000);
    console.log('🗳️  Tournament poll-close job started (every 1 min)');
}
