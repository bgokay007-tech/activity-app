import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { turkeyDateTimeToUtc } from '../utils/tzTime.js';

// CASH/EFT ile ödenen rezervasyonlarda, kort saatinden 30dk sonra işletmeciye
// "geldi mi / ödeme alındı mı" sorusu bildirimle iletilir. 90dk'da (30dk + 1 saat
// cevap süresi) hala yanıt verilmemişse otomatik "onaylandı" sayılır.
export async function processReservationPaymentConfirms() {
    try {
        const now = new Date();

        const candidates = await prisma.courtReservation.findMany({
            where: {
                status: 'CONFIRMED',
                paymentMethod: { in: ['CASH', 'EFT'] },
                paymentConfirmStatus: 'PENDING',
            },
            include: {
                venue: { select: { userId: true, name: true, branch: true } },
                court: { select: { name: true } },
            },
        });
        if (candidates.length === 0) return;

        let promptedCount = 0;
        let autoConfirmedCount = 0;

        for (const r of candidates) {
            const start = turkeyDateTimeToUtc(r.date, r.startTime);
            const minutesSinceStart = (now.getTime() - start.getTime()) / (60 * 1000);

            if (minutesSinceStart >= 90) {
                await prisma.courtReservation.update({ where: { id: r.id }, data: { paymentConfirmStatus: 'CONFIRMED' } });
                autoConfirmedCount++;
                createNotification(r.venue.userId, 'RESERVATION', '✅ Rezervasyon Otomatik Onaylandı',
                    `${r.venue.name} — ${r.court?.name}: ${r.date} ${r.startTime}–${r.endTime} rezervasyonu 1 saat içinde yanıtlanmadığı için otomatik onaylandı sayıldı.`,
                    { reservationId: r.id, category: 'SPORTS', subCategory: r.venue.branch }
                ).catch(() => {});
            } else if (minutesSinceStart >= 30 && !r.paymentPromptSent) {
                await prisma.courtReservation.update({ where: { id: r.id }, data: { paymentPromptSent: true } });
                promptedCount++;
                createNotification(r.venue.userId, 'RESERVATION', '🕐 Ödeme Onayı Bekleniyor',
                    `${r.venue.name} — ${r.court?.name}: ${r.date} ${r.startTime}–${r.endTime} rezervasyonu için müşteri geldi mi, ödeme alındı mı? 1 saat içinde onaylamazsanız otomatik onaylanmış sayılacak.`,
                    { reservationId: r.id, category: 'SPORTS', subCategory: r.venue.branch }
                ).catch(() => {});
            }
        }

        if (promptedCount > 0) console.log(`[paymentConfirm] Prompted ${promptedCount} reservation(s) for owner confirmation`);
        if (autoConfirmedCount > 0) console.log(`[paymentConfirm] Auto-confirmed ${autoConfirmedCount} reservation(s) after 1h no response`);
    } catch (err) {
        console.error('[paymentConfirm] Error:', err.message);
    }
}

export function startReservationPaymentConfirmJob() {
    processReservationPaymentConfirms();
    setInterval(processReservationPaymentConfirms, 5 * 60 * 1000);
    console.log('💳 Reservation payment-confirm job started (every 5 min)');
}
