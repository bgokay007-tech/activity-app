import cron from 'node-cron';
import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { emitToUser } from '../config/socket.js';

const GRACE_DAYS = 7;

async function checkExpiredSubscriptions() {
    const now = new Date();

    const expired = await prisma.businessSubscription.findMany({
        where: { status: 'ACTIVE', endDate: { lt: now } },
        include: { user: { select: { id: true, businessName: true, username: true } } },
    });

    if (!expired.length) return;

    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });

    for (const sub of expired) {
        const expiredDays = (now.getTime() - sub.endDate.getTime()) / (1000 * 60 * 60 * 24);
        const name = sub.user.businessName || sub.user.username;

        if (expiredDays >= GRACE_DAYS) {
            await prisma.businessSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } });

            await createNotification(sub.userId, 'SUBSCRIPTION_CANCELLED', '❌ Aboneliğiniz İptal Edildi',
                '7 gün içinde ödeme alınamadığı için aboneliğiniz iptal edildi. Tekrar başvurabilirsiniz.',
                { subscriptionId: sub.id }
            );
            emitToUser(sub.userId, 'notification', {});

            for (const admin of admins) {
                await createNotification(admin.id, 'SUBSCRIPTION_CANCELLED', '⚠️ Abonelik Otomatik İptal',
                    `${name} adlı işletmenin aboneliği 7 gün ödeme yapılmadığı için otomatik iptal edildi.`,
                    { subscriptionId: sub.id, userId: sub.userId }
                );
                emitToUser(admin.id, 'notification', {});
            }
        } else {
            // Saatte bir uyarı — son 55 dakikada gönderildiyse atla
            const oneHourAgo = new Date(now.getTime() - 55 * 60 * 1000);
            const recentWarn = await prisma.notification.findFirst({
                where: { userId: sub.userId, type: 'SUBSCRIPTION_WARNING', createdAt: { gt: oneHourAgo } },
            });
            if (recentWarn) continue;

            const daysLeft = GRACE_DAYS - Math.floor(expiredDays);
            await createNotification(sub.userId, 'SUBSCRIPTION_WARNING', '⚠️ Abonelik Süresi Doldu',
                `Aboneliğinizin süresi doldu. ${daysLeft} gün içinde yenileme yapmazsanız kullanım haklarınız askıya alınacak.`,
                { subscriptionId: sub.id }
            );
            emitToUser(sub.userId, 'notification', {});
        }
    }
}

export function startSubscriptionExpiryJob() {
    cron.schedule('0 * * * *', () => {
        checkExpiredSubscriptions().catch(console.error);
    });
    console.log('✅ Subscription expiry job scheduled (hourly)');
}
