import prisma from '../config/prisma.js';

export async function cleanupExpiredRivals() {
    try {
        const now = new Date();

        // Find OPEN requests whose match time has passed by 30+ minutes
        const openRequests = await prisma.activityRequest.findMany({
            where: {
                status: 'OPEN',
                matchDate: { not: null },
            },
            select: { id: true, matchDate: true, matchTime: true },
        });

        const expiredIds = openRequests
            .filter(r => {
                const d = new Date(r.matchDate);
                if (r.matchTime) {
                    const [h, m] = r.matchTime.split(':').map(Number);
                    d.setHours(h, m, 0, 0);
                } else {
                    d.setHours(23, 59, 0, 0);
                }
                // Expired = match time + 30 minutes < now
                return d.getTime() + 30 * 60 * 1000 < now.getTime();
            })
            .map(r => r.id);

        if (expiredIds.length > 0) {
            const result = await prisma.activityRequest.updateMany({
                where: { id: { in: expiredIds } },
                data: { status: 'CANCELLED' },
            });
            console.log(`[cleanup] Cancelled ${result.count} expired open rival request(s)`);
        }
    } catch (err) {
        console.error('[cleanup] Error:', err.message);
    }
}

// Start the cleanup job — runs every 5 minutes
export function startCleanupJob() {
    cleanupExpiredRivals(); // run once on startup
    setInterval(cleanupExpiredRivals, 5 * 60 * 1000);
    console.log('🧹 Rival cleanup job started (every 5 min)');
}
