import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';

const PACKAGES = {
    STARTER: { price: 399, label: 'Başlangıç Paketi', durationDays: 30 },
};

// Mevcut abonelik + bekleyen talep durumu
export const getMySubscription = async (req, res, next) => {
    try {
        const now = new Date();
        const [sub, request] = await Promise.all([
            prisma.businessSubscription.findFirst({
                where: { userId: req.userId, status: 'ACTIVE', endDate: { gt: now } },
                orderBy: { endDate: 'desc' },
            }),
            prisma.subscriptionRequest.findFirst({
                where: { userId: req.userId, status: 'PENDING' },
                orderBy: { createdAt: 'desc' },
            }),
        ]);
        res.json({ subscription: sub || null, pendingRequest: request || null, packages: PACKAGES });
    } catch (error) {
        next(error);
    }
};

// Dekont ile abonelik talebi gönder
export const submitSubscriptionRequest = async (req, res, next) => {
    try {
        const { packageType = 'STARTER', receiptUrl } = req.body;
        if (!receiptUrl) return res.status(400).json({ message: 'Dekont görseli gerekli' });

        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isBusiness: true, username: true } });
        if (!user?.isBusiness) return res.status(403).json({ message: 'Yalnızca işletme hesapları paket satın alabilir' });

        const pkg = PACKAGES[packageType];
        if (!pkg) return res.status(400).json({ message: 'Geçersiz paket türü' });

        // Bekleyen talep varsa güncelle, yoksa oluştur
        const existing = await prisma.subscriptionRequest.findFirst({
            where: { userId: req.userId, status: 'PENDING' },
        });

        let request;
        if (existing) {
            request = await prisma.subscriptionRequest.update({
                where: { id: existing.id },
                data: { receiptUrl, packageType },
            });
        } else {
            request = await prisma.subscriptionRequest.create({
                data: { userId: req.userId, packageType, receiptUrl },
            });
        }

        // Tüm adminleri bilgilendir
        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        await Promise.all(admins.map(admin =>
            createNotification(
                admin.id,
                'SUBSCRIPTION_REQUEST',
                '🏢 Yeni Abonelik Talebi',
                `${user.username} işletmesi ${pkg.label} için dekont gönderdi.`,
                { requestId: request.id, userId: req.userId }
            ).then(() => emitToUser(admin.id, 'notification', {})).catch(() => {})
        ));

        res.status(201).json({ request, message: 'Dekont gönderildi, onay bekleniyor' });
    } catch (error) {
        next(error);
    }
};

// Aboneliği iptal et
export const cancelSubscription = async (req, res, next) => {
    try {
        const now = new Date();
        const sub = await prisma.businessSubscription.findFirst({
            where: { userId: req.userId, status: 'ACTIVE', endDate: { gt: now } },
        });
        if (!sub) return res.status(404).json({ message: 'Aktif abonelik bulunamadı' });

        await prisma.businessSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } });
        res.json({ message: 'Abonelik iptal edildi' });
    } catch (error) {
        next(error);
    }
};

// ── Admin fonksiyonları ────────────────────────────────────────────────────────

// Bekleyen talepleri listele
export const getPendingRequests = async (req, res, next) => {
    try {
        const requests = await prisma.subscriptionRequest.findMany({
            where: { status: 'PENDING' },
            include: { user: { select: { id: true, username: true, fullName: true, businessName: true, email: true } } },
            orderBy: { createdAt: 'asc' },
        });
        res.json(requests);
    } catch (error) {
        next(error);
    }
};

// Talebi onayla → abonelik başlat
export const approveRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.subscriptionRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Talep bulunamadı' });
        if (request.status !== 'PENDING') return res.status(400).json({ message: 'Bu talep zaten işlendi' });

        const pkg = PACKAGES[request.packageType];
        if (!pkg) return res.status(400).json({ message: 'Geçersiz paket' });

        const now = new Date();
        const endDate = new Date(now.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);

        await prisma.$transaction([
            prisma.subscriptionRequest.update({ where: { id }, data: { status: 'APPROVED' } }),
            prisma.businessSubscription.updateMany({ where: { userId: request.userId, status: 'ACTIVE' }, data: { status: 'CANCELLED' } }),
            prisma.businessSubscription.create({
                data: { userId: request.userId, packageType: request.packageType, status: 'ACTIVE', startDate: now, endDate },
            }),
        ]);

        await createNotification(
            request.userId,
            'SUBSCRIPTION_APPROVED',
            '✅ Aboneliğiniz Onaylandı',
            `${pkg.label} aboneliğiniz aktif edildi. İyi kullanımlar!`,
            { packageType: request.packageType }
        );
        emitToUser(request.userId, 'notification', {});

        res.json({ message: 'Abonelik onaylandı ve aktif edildi' });
    } catch (error) {
        next(error);
    }
};

// Talebi reddet
export const rejectRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;

        const request = await prisma.subscriptionRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Talep bulunamadı' });
        if (request.status !== 'PENDING') return res.status(400).json({ message: 'Bu talep zaten işlendi' });

        await prisma.subscriptionRequest.update({ where: { id }, data: { status: 'REJECTED', adminNote: adminNote || null } });

        await createNotification(
            request.userId,
            'SUBSCRIPTION_REJECTED',
            '❌ Abonelik Talebi Reddedildi',
            adminNote || 'Dekontunuz onaylanamadı. Lütfen tekrar deneyin veya bizimle iletişime geçin.',
            {}
        );
        emitToUser(request.userId, 'notification', {});

        res.json({ message: 'Talep reddedildi' });
    } catch (error) {
        next(error);
    }
};
