import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { broadcast } from '../config/socket.js';

// Bir ekipman ilanı "Satıldı" işaretlenirken bir alıcı seçildiyse, o kişinin 24 saat
// içinde onaylaması beklenir (bkz. equipment.controller.js markSold/confirmSold). Süre
// dolduğunda hâlâ yanıt vermediyse satış otomatik onaylanmış sayılır — seçilen kişi
// gerçekten yanlışsa zaten reddedebileceği süre geçmiştir, olumsuz bir aksiyon değildir.
async function autoConfirmExpiredSales() {
    try {
        const now = new Date();
        const expired = await prisma.equipmentListing.findMany({
            where: { status: 'SOLD', soldToUserId: { not: null }, soldToConfirmed: false, soldToConfirmDeadline: { lt: now } },
        });
        if (expired.length === 0) return;

        for (const listing of expired) {
            try {
                const updated = await prisma.equipmentListing.update({
                    where: { id: listing.id },
                    data: { soldToConfirmed: true, soldToConfirmDeadline: null },
                });
                broadcast('equipmentUpdate', updated);
                createNotification(
                    listing.userId, 'EQUIPMENT_SOLD_CONFIRM',
                    '✅ Satış Otomatik Onaylandı',
                    `"${listing.title}" ürünü için seçtiğin kişi 24 saat içinde yanıt vermedi, satış otomatik onaylandı.`,
                    { listingId: listing.id, category: listing.category, subCategory: listing.subCategory }
                ).catch(() => {});
            } catch (e) {
                console.error(`[equipmentAutoConfirmSold] Failed to auto-confirm listing ${listing.id}:`, e.message);
            }
        }
        console.log(`[equipmentAutoConfirmSold] Auto-confirmed ${expired.length} sale(s)`);
    } catch (err) {
        console.error('[equipmentAutoConfirmSold] error:', err.message);
    }
}

export function startEquipmentAutoConfirmSoldJob() {
    autoConfirmExpiredSales();
    setInterval(autoConfirmExpiredSales, 15 * 60 * 1000); // every 15 minutes
    console.log('🎾 Equipment auto-confirm sold job started (every 15 min)');
}
