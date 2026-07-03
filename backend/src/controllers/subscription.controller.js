import prisma from '../config/prisma.js';

const PACKAGES = {
    STARTER: { price: 399, label: 'Başlangıç Paketi', durationDays: 30 },
};

// Mevcut abonelik durumu
export const getMySubscription = async (req, res, next) => {
    try {
        const now = new Date();
        const sub = await prisma.businessSubscription.findFirst({
            where: { userId: req.userId, status: 'ACTIVE', endDate: { gt: now } },
            orderBy: { endDate: 'desc' },
        });
        res.json({ subscription: sub || null, packages: PACKAGES });
    } catch (error) {
        next(error);
    }
};

// Paketi aktif et (ödeme entegrasyonu sonraya bırakıldı — admin veya test amaçlı)
export const activateSubscription = async (req, res, next) => {
    try {
        const { packageType = 'STARTER' } = req.body;

        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isBusiness: true } });
        if (!user?.isBusiness) return res.status(403).json({ message: 'Yalnızca işletme hesapları paket satın alabilir' });

        const pkg = PACKAGES[packageType];
        if (!pkg) return res.status(400).json({ message: 'Geçersiz paket türü' });

        const now = new Date();

        // Aktif abonelik varsa iptal et
        await prisma.businessSubscription.updateMany({
            where: { userId: req.userId, status: 'ACTIVE' },
            data: { status: 'CANCELLED' },
        });

        const endDate = new Date(now.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);

        const sub = await prisma.businessSubscription.create({
            data: {
                userId: req.userId,
                packageType,
                status: 'ACTIVE',
                startDate: now,
                endDate,
            },
        });

        res.status(201).json({ subscription: sub, message: `${pkg.label} aktif edildi` });
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
