import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { emitToUser } from '../config/socket.js';

export async function cleanupExpiredRivals() {
    try {
        const now = new Date();

        // Find OPEN requests whose match time has passed by 5+ minutes — linkedRivalId'i
        // olanlar (ör. "Hakem Arıyorum" ilanları) burada YOK sayılır, onlar asıl maçtan
        // bağımsız, ayrı bir mantıkla (aşağıda) süresi geçince kapatılır. Aksi halde bir
        // maçın oyuncuları tam olsa bile (maç MATCHED'e geçip buradan zaten düşse de) sadece
        // hakemi bulunamadığında, hakem ilanı buradan "yeterli oyuncu bulunamadı" diye
        // iptal ediliyor ve bu bildirim asıl maça aitmiş gibi sahibine gidiyordu.
        const openRequests = await prisma.activityRequest.findMany({
            where: {
                status: 'OPEN',
                matchDate: { not: null },
                linkedRivalId: null,
            },
            select: { id: true, senderId: true, subCategory: true, matchDate: true, matchTime: true },
        });

        const expired = openRequests.filter(r => {
            const d = new Date(r.matchDate);
            if (r.matchTime) {
                const [h, m] = r.matchTime.split(':').map(Number);
                d.setHours(h, m, 0, 0);
            } else {
                d.setHours(23, 59, 0, 0);
            }
            // Expired = match time + 5 minutes < now
            return d.getTime() + 5 * 60 * 1000 < now.getTime();
        });

        if (expired.length > 0) {
            const result = await prisma.activityRequest.updateMany({
                where: { id: { in: expired.map(r => r.id) } },
                data: { status: 'CANCELLED' },
            });
            console.log(`[cleanup] Cancelled ${result.count} expired open rival request(s)`);
            // İlan sahibine haber ver — sessizce iptal olursa "ilanım nereye gitti" sorusuna yol açıyordu.
            for (const r of expired) {
                emitToUser(r.senderId, 'rivalDeleted', { rivalId: r.id, subCategory: r.subCategory });
                createNotification(
                    r.senderId,
                    'MATCH_EXPIRED',
                    '⏰ İlanınız Kaldırıldı',
                    `${r.subCategory} ilanınız için yeterli oyuncu bulunamadı ve maç saati geldiği için otomatik kaldırıldı.`,
                    {},
                ).catch(() => {});
            }
        }

        // "Hakem Arıyorum" ilanları (linkedRivalId dolu, positions:['REFEREE']) hâlâ OPEN'sa
        // ve maç saati geçtiyse: hakem bulunamamış demektir — ama asıl maç (oyuncular tamsa
        // zaten MATCHED'e geçmiştir) bundan ETKİLENMEZ, saati geldiğinde normal şekilde
        // Skor Bekleyen Maçlar'a düşmeye devam eder. Sadece hakem ilanı kapatılır ve sahibine
        // ayrı, doğru ifadeli bir bildirim gider.
        const openRefereeAds = await prisma.activityRequest.findMany({
            where: {
                status: 'OPEN',
                matchDate: { not: null },
                linkedRivalId: { not: null },
            },
            select: { id: true, senderId: true, category: true, subCategory: true, matchDate: true, matchTime: true, linkedRivalId: true },
        });

        const expiredRefereeAds = openRefereeAds.filter(r => {
            const d = new Date(r.matchDate);
            if (r.matchTime) {
                const [h, m] = r.matchTime.split(':').map(Number);
                d.setHours(h, m, 0, 0);
            } else {
                d.setHours(23, 59, 0, 0);
            }
            return d.getTime() + 5 * 60 * 1000 < now.getTime();
        });

        if (expiredRefereeAds.length > 0) {
            await prisma.activityRequest.updateMany({
                where: { id: { in: expiredRefereeAds.map(r => r.id) } },
                data: { status: 'CANCELLED' },
            });
            await prisma.activityRequest.updateMany({
                where: { id: { in: expiredRefereeAds.map(r => r.linkedRivalId) } },
                data: { refereeRequested: false },
            });
            console.log(`[cleanup] Cancelled ${expiredRefereeAds.length} expired referee-wanted ad(s)`);
            for (const r of expiredRefereeAds) {
                emitToUser(r.senderId, 'rivalDeleted', { rivalId: r.id, subCategory: r.subCategory });
                createNotification(
                    r.senderId,
                    'REFEREE_NOT_FOUND',
                    '🧑‍⚖️ Hakem Bulunamadı',
                    `${r.subCategory} maçınız için hakem bulunamadı, hakem ilanı kaldırıldı. Maçınız hakemsiz devam edecek.`,
                    // category/subCategory olmadan bildirim ekranı hicbir yere yonlendiremiyordu
                    // ("ortada mac yok" gibi görünüyordu) - asil macin (linkedRivalId) bilgileri.
                    { rivalId: r.linkedRivalId, category: r.category, subCategory: r.subCategory },
                ).catch(() => {});
            }
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
