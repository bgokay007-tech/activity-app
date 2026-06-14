import prisma from '../config/prisma.js';

const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

async function cleanupExpiredTournaments() {
    try {
        const now = new Date();

        const open = await prisma.tournament.findMany({
            where: { status: 'OPEN', eventDate: { not: null } },
            select: { id: true, eventDate: true, eventTime: true },
        });

        const expiredIds = open
            .filter(t => {
                // eventDate is stored as midnight UTC; eventTime is local Turkey time (UTC+3)
                const d = new Date(t.eventDate);
                if (t.eventTime) {
                    const [h, m] = t.eventTime.split(':').map(Number);
                    d.setUTCHours(h, m, 0, 0);
                    d.setTime(d.getTime() - TURKEY_OFFSET_MS); // Turkey → UTC
                } else {
                    // No time set → expire at end of that day in Turkey (21:00 UTC)
                    d.setUTCHours(21, 0, 0, 0);
                }
                return d.getTime() <= now.getTime();
            })
            .map(t => t.id);

        if (expiredIds.length > 0) {
            const result = await prisma.tournament.deleteMany({ where: { id: { in: expiredIds } } });
            console.log(`[cleanup-tournaments] Deleted ${result.count} expired unstarted tournament(s)`);
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
