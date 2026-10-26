import prisma from '../config/prisma.js';
import {
    MAX_CARDS, brandOf, digitsOnly, luhnOk, panHash, parseExpiry, sealPan, validHolder,
} from '../utils/cardVault.js';

const PUBLIC = {
    id: true,
    holderName: true,
    brand: true,
    last4: true,
    expiryMonth: true,
    expiryYear: true,
    isDefault: true,
    createdAt: true,
};

export const listPaymentMethods = async (req, res, next) => {
    try {
        const cards = await prisma.paymentMethod.findMany({
            where: { userId: req.userId },
            select: PUBLIC,
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
        res.json(cards);
    } catch (error) { next(error); }
};

export const createPaymentMethod = async (req, res, next) => {
    try {
        const holderName = validHolder(req.body?.holderName);
        if (!holderName) return res.status(400).json({ code: 'CARD_HOLDER' });
        const digits = digitsOnly(req.body?.cardNumber);
        if (!luhnOk(digits)) return res.status(400).json({ code: 'CARD_INVALID' });
        const expiry = parseExpiry(req.body?.expiryMonth, req.body?.expiryYear);
        if (!expiry) return res.status(400).json({ code: 'CARD_EXPIRY' });
        if (expiry.expired) return res.status(400).json({ code: 'CARD_EXPIRED' });

        const count = await prisma.paymentMethod.count({ where: { userId: req.userId } });
        if (count >= MAX_CARDS) return res.status(400).json({ code: 'CARD_LIMIT' });

        const hash = panHash(digits);
        const existing = await prisma.paymentMethod.findFirst({
            where: { userId: req.userId, panHash: hash },
            select: { id: true },
        });
        if (existing) return res.status(409).json({ code: 'CARD_DUPLICATE' });

        const sealed = sealPan(digits);
        const card = await prisma.paymentMethod.create({
            data: {
                userId: req.userId,
                holderName,
                brand: brandOf(digits),
                last4: digits.slice(-4),
                expiryMonth: expiry.month,
                expiryYear: expiry.year,
                panHash: hash,
                isDefault: count === 0,
                ...sealed,
            },
            select: PUBLIC,
        });
        res.status(201).json(card);
    } catch (error) { next(error); }
};

export const setDefaultPaymentMethod = async (req, res, next) => {
    try {
        const card = await prisma.paymentMethod.findFirst({
            where: { id: req.params.id, userId: req.userId },
            select: { id: true },
        });
        if (!card) return res.status(404).json({ code: 'CARD_NOT_FOUND' });
        await prisma.$transaction([
            prisma.paymentMethod.updateMany({
                where: { userId: req.userId },
                data: { isDefault: false },
            }),
            prisma.paymentMethod.update({
                where: { id: card.id },
                data: { isDefault: true },
            }),
        ]);
        const cards = await prisma.paymentMethod.findMany({
            where: { userId: req.userId },
            select: PUBLIC,
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
        res.json(cards);
    } catch (error) { next(error); }
};

export const deletePaymentMethod = async (req, res, next) => {
    try {
        const card = await prisma.paymentMethod.findFirst({
            where: { id: req.params.id, userId: req.userId },
            select: { id: true, isDefault: true },
        });
        if (!card) return res.status(404).json({ code: 'CARD_NOT_FOUND' });
        await prisma.paymentMethod.delete({ where: { id: card.id } });
        if (card.isDefault) {
            const nextCard = await prisma.paymentMethod.findFirst({
                where: { userId: req.userId },
                orderBy: { createdAt: 'desc' },
                select: { id: true },
            });
            if (nextCard) {
                await prisma.paymentMethod.update({
                    where: { id: nextCard.id },
                    data: { isDefault: true },
                });
            }
        }
        const cards = await prisma.paymentMethod.findMany({
            where: { userId: req.userId },
            select: PUBLIC,
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
        res.json(cards);
    } catch (error) { next(error); }
};
