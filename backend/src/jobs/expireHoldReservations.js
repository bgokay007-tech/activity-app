import prisma from '../config/prisma.js';
import { emitToUser } from '../config/socket.js';
import { createNotification } from '../controllers/notification.controller.js';

/**
 * Teklif kabulünde açılan HOLD (askıda) rezervasyonlar holdUntil geçince düşer.
 * Slot serbest kalır; bağlı turnuva maçı scheduleData.agreed.reservationId temizlenir.
 */
export async function expireHoldReservations() {
    try {
        const now = new Date();
        const expired = await prisma.courtReservation.findMany({
            where: {
                status: 'HOLD',
                holdUntil: { lte: now },
            },
            include: {
                venue: { select: { id: true, userId: true, name: true, branch: true } },
                court: { select: { id: true, name: true } },
                user: { select: { id: true, username: true } },
            },
            take: 80,
        });
        if (!expired.length) return;

        for (const res of expired) {
            await prisma.courtReservation.update({
                where: { id: res.id },
                data: { status: 'CANCELLED', holdUntil: null },
            });

            if (res.tournamentMatchId) {
                const match = await prisma.tournamentMatch.findUnique({
                    where: { id: res.tournamentMatchId },
                    select: { id: true, tournamentId: true, scheduleData: true },
                });
                if (match?.scheduleData && typeof match.scheduleData === 'object') {
                    const schedule = { ...match.scheduleData };
                    if (schedule.agreed?.reservationId === res.id) {
                        schedule.agreed = {
                            ...schedule.agreed,
                            reservationId: null,
                            reservationStatus: null,
                            holdExpiredAt: now.toISOString(),
                        };
                        await prisma.tournamentMatch.update({
                            where: { id: match.id },
                            data: { scheduleData: schedule },
                        });
                        if (res.userId) {
                            emitToUser(res.userId, 'tournament:schedule_updated', {
                                tournamentId: match.tournamentId,
                                matchId: match.id,
                                scheduleData: schedule,
                            });
                        }
                    }
                }
            }

            if (res.venue?.userId) {
                createNotification(
                    res.venue.userId,
                    'RESERVATION',
                    '⌛ Askı süresi doldu',
                    `${res.venue.name} — ${res.court?.name || 'Kort'} ${res.date} ${res.startTime}–${res.endTime} askıdaki yer serbest kaldı.`,
                    { reservationId: res.id, category: 'SPORTS', subCategory: res.venue.branch },
                ).catch(() => {});
            }
            if (res.userId) {
                createNotification(
                    res.userId,
                    'RESERVATION',
                    '⌛ Askıdaki rezervasyon düştü',
                    `${res.venue?.name || 'Tesis'} — ${res.date} ${res.startTime}–${res.endTime} için 4 saatlik askı süresi doldu. Yeniden rezervasyon yapabilirsiniz.`,
                    { reservationId: res.id, category: 'SPORTS', subCategory: res.venue?.branch },
                ).catch(() => {});
                emitToUser(res.userId, 'reservationUpdate', { reservationId: res.id, status: 'CANCELLED' });
            }
        }
        console.log(`[expireHold] Cancelled ${expired.length} expired HOLD reservation(s)`);
    } catch (err) {
        console.error('[expireHold] Error:', err.message);
    }
}

export function startExpireHoldReservationsJob() {
    expireHoldReservations();
    setInterval(expireHoldReservations, 2 * 60 * 1000);
    console.log('⏰ Expire HOLD reservations job started (every 2 min)');
}
