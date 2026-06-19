import prisma from '../config/prisma.js';

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
    setInterval(cleanupExpiredTournaments, 2 * 60 * 1000); // every 2 minutes
    console.log('🧹 Tournament cleanup job started (every 2 min)');
}
