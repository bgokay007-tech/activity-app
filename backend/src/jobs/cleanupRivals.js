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
            select: {
                id: true, senderId: true, category: true, subCategory: true, matchDate: true, matchTime: true,
                participants: true, senderTeam: true, unassignedPlayers: true,
            },
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
            // Sadece ilan sahibine değil, o ana kadar katılmış herkese (takım arkadaşları,
            // rakip taraf, henüz bir tarafa atanmamış kabul edilmiş oyuncular) haber ver —
            // önceden sadece sender'a emitToUser yapılıyordu, bu yüzden bir katılımcı ilan
            // detayını açık tutuyorsa maç iptal olduğunda hiç bilgilendirilmiyor, ölü bir
            // ekranda kalıyordu (kullanıcı raporu: "detay kısmında kaldım, yönlendirmeliydi").
            for (const r of expired) {
                const involvedIds = [...new Set([
                    r.senderId,
                    ...(Array.isArray(r.senderTeam) ? r.senderTeam : []).filter(p => p?.id).map(p => p.id),
                    ...(Array.isArray(r.participants) ? r.participants : []).filter(p => p?.id).map(p => p.id),
                    ...(Array.isArray(r.unassignedPlayers) ? r.unassignedPlayers : []).filter(p => p?.id).map(p => p.id),
                ])];
                for (const uid of involvedIds) {
                    emitToUser(uid, 'rivalDeleted', { rivalId: r.id, subCategory: r.subCategory });
                }
                // priority:'high' — Android'de 'default' öncelikli push'lar uygulama kapalıyken/
                // arka plandayken Doze moduna takılıp ertelenebiliyor, kullanıcı ancak uygulamayı
                // açınca (soket yeniden bağlanınca) bildirimi görüyordu. İlanın kaldırıldığını hemen
                // bilmesi gerektiği için (kaçırdığı maç gibi) bu 'high' öncelik hak ediyor.
                createNotification(
                    r.senderId,
                    'MATCH_EXPIRED',
                    '⏰ İlanınız Kaldırıldı',
                    `${r.subCategory} ilanınız için yeterli oyuncu bulunamadı ve maç saati geldiği için otomatik kaldırıldı.`,
                    { rivalId: r.id, category: r.category, subCategory: r.subCategory },
                    'high',
                ).catch(() => {});
                for (const uid of involvedIds) {
                    if (uid === r.senderId) continue;
                    createNotification(
                        uid,
                        'MATCH_EXPIRED',
                        '⏰ Maç İptal Edildi',
                        `Katıldığınız ${r.subCategory} maçı için yeterli oyuncu bulunamadı ve maç saati geldiği için otomatik iptal edildi.`,
                        { rivalId: r.id, category: r.category, subCategory: r.subCategory },
                        'high',
                    ).catch(() => {});
                }
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
            // Hakem ilanı süresi geçtiğinde bağlı olduğu asıl maç zaten (yetersiz oyuncudan,
            // ayrılmadan vs.) CANCELLED olmuş olabilir — o zaman "hakem bulunamadı, maçınız
            // hakemsiz devam edecek" bildirimi anlamsız çünkü ortada devam edecek maç yok.
            const linkedIds = [...new Set(expiredRefereeAds.map(r => r.linkedRivalId))];
            const linkedMatches = await prisma.activityRequest.findMany({
                where: { id: { in: linkedIds } },
                select: { id: true, status: true },
            });
            const linkedStatus = new Map(linkedMatches.map(m => [m.id, m.status]));

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
                if (linkedStatus.get(r.linkedRivalId) === 'CANCELLED') continue;
                createNotification(
                    r.senderId,
                    'REFEREE_NOT_FOUND',
                    '🧑‍⚖️ Hakem Bulunamadı',
                    `${r.subCategory} maçınız için hakem bulunamadı, hakem ilanı kaldırıldı. Maçınız hakemsiz devam edecek.`,
                    // category/subCategory olmadan bildirim ekranı hicbir yere yonlendiremiyordu
                    // ("ortada mac yok" gibi görünüyordu) - asil macin (linkedRivalId) bilgileri.
                    { rivalId: r.linkedRivalId, category: r.category, subCategory: r.subCategory },
                    'high',
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
