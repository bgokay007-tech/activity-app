import prisma from '../config/prisma.js';
import { emitToUser } from '../config/socket.js';
import { createNotification } from '../controllers/notification.controller.js';

export async function autoApproveEftReservations() {
    try {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 saat önce

        // EFT_TIMED modunda olan venue/court'lara ait 1 saatten uzun süredir PENDING EFT rezervasyonları bul
        const pending = await prisma.courtReservation.findMany({
            where: {
                status: 'PENDING',
                paymentMethod: 'EFT',
                createdAt: { lte: cutoff },
            },
            include: {
                venue: { select: { id: true, userId: true, name: true, branch: true, approvalMode: true } },
                court: { select: { id: true, name: true, approvalMode: true } },
                user:  { select: { id: true, username: true } },
            },
        });

        if (pending.length === 0) return;

        for (const res of pending) {
            const mode = res.court?.approvalMode || res.venue?.approvalMode || 'FULL_AUTO';
            if (mode !== 'EFT_TIMED') continue;

            await prisma.courtReservation.update({
                where: { id: res.id },
                data: { status: 'CONFIRMED' },
            });

            createNotification(res.venue.userId, 'RESERVATION', '⏱️ EFT Rezervasyon Otomatik Onaylandı',
                `${res.user?.username} — ${res.venue.name} / ${res.court?.name} için ${res.date} ${res.startTime}–${res.endTime} EFT rezervasyonu 1 saat içinde onaylanmadı, otomatik onaylandı.`,
                { reservationId: res.id, category: 'SPORTS', subCategory: res.venue.branch }
            ).catch(() => {});

            createNotification(res.userId, 'RESERVATION', '✅ Rezervasyonunuz Onaylandı',
                `${res.venue.name} — ${res.court?.name} için ${res.date} ${res.startTime}–${res.endTime} rezervasyonunuz onaylandı.`,
                { reservationId: res.id, category: 'SPORTS', subCategory: res.venue.branch }
            ).catch(() => {});

            emitToUser(res.userId, 'reservationUpdate', { reservationId: res.id, status: 'CONFIRMED' });
        }

        const count = pending.filter(r => (r.court?.approvalMode || r.venue?.approvalMode || 'FULL_AUTO') === 'EFT_TIMED').length;
        if (count > 0) console.log(`[autoApproveEFT] Auto-approved ${count} EFT reservation(s)`);
    } catch (err) {
        console.error('[autoApproveEFT] Error:', err.message);
    }
}

export function startAutoApproveReservationsJob() {
    autoApproveEftReservations();
    setInterval(autoApproveEftReservations, 5 * 60 * 1000);
    console.log('⏰ Auto-approve EFT reservations job started (every 5 min)');
}
