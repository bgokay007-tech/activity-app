import prisma from '../config/prisma.js';

async function cleanupExpiredTournaments() {
    try {
        const now = new Date();

        const open = await prisma.tournament.findMany({
            where: { status: 'OPEN', eventDate: { not: null } },
            select: { id: true, eventDate: true, eventTime: true },
        });

        const expiredIds = open
            .filter(t => {
                const d = new Date(t.eventDate);
                if (t.eventTime) {
                    const [h, m] = t.eventTime.split(':').map(Number);
                    d.setHours(h, m, 0, 0);
                } else {
                    d.setHours(23, 59, 0, 0);
                }
                return d.getTime() < now.getTime();
            })
            .map(t => t.id);

        if (expiredIds.length > 0) {
            const result = await prisma.tournament.deleteMany({ where: { id: { in: expiredIds } } });
            console.log(`[cleanup] Deleted ${result.count} expired unstarted tournament(s)`);
        }
    } catch (err) {
        console.error('[cleanup-tournaments] Error:', err.message);
    }
}

export function startTournamentCleanupJob() {
    cleanupExpiredTournaments();
    setInterval(cleanupExpiredTournaments, 10 * 60 * 1000);
    console.log('🧹 Tournament cleanup job started (every 10 min)');
}
