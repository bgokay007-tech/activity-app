import cron from 'node-cron';
import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { emitToUser } from '../config/socket.js';

// coach.controller.js'deki COACH_APPROVAL_SPORTS ile aynı liste.
const COACH_APPROVAL_SPORTS = ['volleyball', 'tennis', 'padel'];
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Kullanıcı isteği: admin onaylarken "şu bilgiler eksik/yanlış, X gün içinde düzeltilmezse
// onay iptal edilir" diyebiliyor (bkz. setCoachListingApproval conditionalNote/
// conditionalDeadline) — süre dolana kadar kullanıcı ilanını güncellerse (updateListing)
// düzeltme girişimi sayılıp bu alanlar zaten temizleniyor, buraya hiç düşmüyor.
async function checkConditionalDeadlines() {
    const now = new Date();
    const expired = await prisma.coachListing.findMany({
        where: { approved: true, conditionalDeadline: { lt: now } },
        select: { id: true, userId: true, conditionalNote: true },
    });
    for (const listing of expired) {
        await prisma.coachListing.update({
            where: { id: listing.id },
            data: { approved: false, conditionalNote: null, conditionalDeadline: null },
        });
        await createNotification(listing.userId, 'COACH_APPROVAL_CONDITIONAL_EXPIRED', '🚫 Antrenörlük Onayınız İptal Edildi',
            `Admin'in belirttiği eksiklik/hatayı ("${listing.conditionalNote || ''}") süresi içinde düzeltmediğiniz için antrenörlük onayınız otomatik olarak iptal edildi. Bilgilerinizi güncelleyip yeniden admin onayına gönderebilirsiniz.`,
            {}
        );
        emitToUser(listing.userId, 'notification', {});
    }
}

// Kullanıcı isteği: antrenörlük onayı süresiz değil — en son onaylandığı tarihten (approvedAt)
// itibaren 1 yıl geçerli, süre dolunca otomatik iptal edilir. approvedAt SİLİNMEZ, böylece
// bir sonraki başvuru admin panelinde "yenileme başvurusu" olarak görünür (bkz.
// setCoachListingApproval, AdminPage.jsx ApprovalQueuePanel renewal_badge).
async function checkYearlyExpiry() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - YEAR_MS);
    const expired = await prisma.coachListing.findMany({
        where: {
            subCategory: { in: COACH_APPROVAL_SPORTS },
            approved: true,
            approvedAt: { lt: cutoff },
            conditionalDeadline: null, // koşullu süre zaten kendi kontrolünde işleniyor
        },
        select: { id: true, userId: true },
    });
    for (const listing of expired) {
        await prisma.coachListing.update({ where: { id: listing.id }, data: { approved: false } });
        await createNotification(listing.userId, 'COACH_APPROVAL_YEARLY_EXPIRED', '📅 Antrenörlük Onayınızın Süresi Doldu',
            'Antrenörlük onayınız 1 yıl geçerliydi ve süresi doldu, ilanınız artık başkalarına görünmüyor. Bilgilerinizi güncelleyip yeniden admin onayına göndererek antrenörlüğünüzü tekrar aktif hale getirebilirsiniz.',
            {}
        );
        emitToUser(listing.userId, 'notification', {});
    }
}

export function startCoachApprovalExpiryJob() {
    cron.schedule('0 * * * *', () => {
        checkConditionalDeadlines().catch(console.error);
        checkYearlyExpiry().catch(console.error);
    });
    console.log('✅ Coach approval expiry job scheduled (hourly)');
}
