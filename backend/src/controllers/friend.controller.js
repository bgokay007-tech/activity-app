import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';
import { getRelation, canAccess } from '../utils/privacy.js';

const FRIEND_SELECT = {
    // gender eklendi: DOUBLE kadro kartında (Arkadaşlarım listesinden çoklu seçim) cinsiyet
    // kısıtlı bir formaya yanlış cinsiyette biri seçilirse anında uyarı verebilmek için.
    id: true, username: true, fullName: true, avatar: true, isPublic: true, gender: true,
};

export const sendRequest = async (req, res, next) => {
    try {
        const { userId: receiverId } = req.params;
        if (receiverId === req.userId) return res.status(400).json({ message: 'Cannot add yourself' });

        const blocked = await prisma.block.findFirst({
            where: { OR: [{ blockerId: req.userId, blockedId: receiverId }, { blockerId: receiverId, blockedId: req.userId }] },
        });
        if (blocked) return res.status(403).json({ message: 'Cannot send request' });

        const existing = await prisma.friendship.findFirst({
            where: { OR: [{ senderId: req.userId, receiverId }, { senderId: receiverId, receiverId: req.userId }] },
        });
        if (existing && existing.status !== 'REJECTED') {
            return res.status(400).json({ message: 'Request already exists', status: existing.status });
        }
        if (existing) await prisma.friendship.delete({ where: { id: existing.id } });

        const friendship = await prisma.friendship.create({
            data: { senderId: req.userId, receiverId },
        });

        const sender = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
        createNotification(
            receiverId, 'FRIEND_REQUEST',
            '👥 Arkadaşlık İsteği',
            `${sender?.fullName || sender?.username} size arkadaşlık isteği gönderdi.`,
            { senderId: req.userId, senderUsername: sender?.username },
        ).catch(() => {});

        res.status(201).json(friendship);
    } catch (error) { next(error); }
};

export const respondRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // 'accept' | 'reject'

        const friendship = await prisma.friendship.findUnique({ where: { id } });
        if (!friendship || friendship.receiverId !== req.userId)
            return res.status(404).json({ message: 'Request not found' });

        const updated = await prisma.friendship.update({
            where: { id },
            data: { status: action === 'accept' ? 'ACCEPTED' : 'REJECTED' },
        });

        if (action === 'accept') {
            const accepter = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
            createNotification(
                friendship.senderId, 'FRIEND_ACCEPTED',
                '🤝 Arkadaşlık İsteği Kabul Edildi',
                `${accepter?.fullName || accepter?.username} arkadaşlık isteğinizi kabul etti.`,
                { senderId: req.userId, senderUsername: accepter?.username },
            ).catch(() => {});
        }

        // Açık olan profil ekranı (varsa) sayfa yenilemeye gerek kalmadan güncellensin
        emitToUser(friendship.senderId, 'friend:status_changed', {
            otherUserId: req.userId, status: updated.status, friendshipId: updated.id,
        });

        res.json(updated);
    } catch (error) { next(error); }
};

export const unfriend = async (req, res, next) => {
    try {
        const { userId } = req.params;
        await prisma.friendship.deleteMany({
            where: {
                OR: [
                    { senderId: req.userId, receiverId: userId },
                    { senderId: userId, receiverId: req.userId },
                ],
            },
        });
        res.json({ message: 'Unfriended' });
    } catch (error) { next(error); }
};

export const blockUser = async (req, res, next) => {
    try {
        const { userId: blockedId } = req.params;
        if (blockedId === req.userId) return res.status(400).json({ message: 'Cannot block yourself' });

        // Arkadaşlığı da sil
        await prisma.friendship.deleteMany({
            where: {
                OR: [
                    { senderId: req.userId, receiverId: blockedId },
                    { senderId: blockedId, receiverId: req.userId },
                ],
            },
        });

        const block = await prisma.block.upsert({
            where: { blockerId_blockedId: { blockerId: req.userId, blockedId } },
            create: { blockerId: req.userId, blockedId },
            update: {},
        });
        res.json(block);
    } catch (error) { next(error); }
};

export const unblockUser = async (req, res, next) => {
    try {
        const { userId: blockedId } = req.params;
        await prisma.block.deleteMany({ where: { blockerId: req.userId, blockedId } });
        res.json({ message: 'Unblocked' });
    } catch (error) { next(error); }
};

export const getFriendsOf = async (req, res, next) => {
    try {
        const { userId } = req.params;
        if (userId !== req.userId) {
            const owner = await prisma.user.findUnique({
                where: { id: userId },
                select: { friendsListPrivacy: true, friendsListExclude: true },
            });
            if (!owner) return res.status(404).json({ message: 'User not found' });
            const { isFriend, isFollower } = await getRelation(userId, req.userId);
            if (!canAccess({ ownerId: userId, viewerId: req.userId, mode: owner.friendsListPrivacy, list: owner.friendsListExclude, isFriend, isFollower })) {
                return res.json([]);
            }
        }
        const friendships = await prisma.friendship.findMany({
            where: {
                OR: [{ senderId: userId }, { receiverId: userId }],
                status: 'ACCEPTED',
            },
            include: {
                sender:   { select: FRIEND_SELECT },
                receiver: { select: FRIEND_SELECT },
            },
        });
        const friends = friendships.map(f =>
            f.senderId === userId ? f.receiver : f.sender
        );
        res.json(friends);
    } catch (error) { next(error); }
};

export const getFriends = async (req, res, next) => {
    try {
        const friendships = await prisma.friendship.findMany({
            where: {
                OR: [{ senderId: req.userId }, { receiverId: req.userId }],
                status: 'ACCEPTED',
            },
            include: {
                sender:   { select: FRIEND_SELECT },
                receiver: { select: FRIEND_SELECT },
            },
        });
        const friends = friendships.map(f =>
            f.senderId === req.userId ? f.receiver : f.sender
        );
        res.json(friends);
    } catch (error) { next(error); }
};

export const getPendingRequests = async (req, res, next) => {
    try {
        const received = await prisma.friendship.findMany({
            where: { receiverId: req.userId, status: 'PENDING' },
            include: { sender: { select: FRIEND_SELECT } },
        });
        const sent = await prisma.friendship.findMany({
            where: { senderId: req.userId, status: 'PENDING' },
            include: { receiver: { select: FRIEND_SELECT } },
        });
        res.json({ received, sent });
    } catch (error) { next(error); }
};

export const getBlockList = async (req, res, next) => {
    try {
        const blocks = await prisma.block.findMany({
            where: { blockerId: req.userId },
            include: { blocked: { select: FRIEND_SELECT } },
        });
        res.json(blocks.map(b => b.blocked));
    } catch (error) { next(error); }
};

// Mesaj engeli — tam Block'tan farklı, sadece mesajlaşmayı durdurur; arkadaşlık/
// takip/arama/profil görüntüleme etkilenmez.
export const blockMessages = async (req, res, next) => {
    try {
        const { userId: blockedId } = req.params;
        if (blockedId === req.userId) return res.status(400).json({ message: 'Cannot block yourself' });
        const block = await prisma.messageBlock.upsert({
            where: { blockerId_blockedId: { blockerId: req.userId, blockedId } },
            create: { blockerId: req.userId, blockedId },
            update: {},
        });
        res.json(block);
    } catch (error) { next(error); }
};

export const unblockMessages = async (req, res, next) => {
    try {
        const { userId: blockedId } = req.params;
        await prisma.messageBlock.deleteMany({ where: { blockerId: req.userId, blockedId } });
        res.json({ message: 'Unblocked' });
    } catch (error) { next(error); }
};

export const getMessageBlockList = async (req, res, next) => {
    try {
        const blocks = await prisma.messageBlock.findMany({
            where: { blockerId: req.userId },
            include: { blocked: { select: FRIEND_SELECT } },
        });
        res.json(blocks.map(b => b.blocked));
    } catch (error) { next(error); }
};

export const getFriendshipStatus = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const friendship = await prisma.friendship.findFirst({
            where: {
                OR: [
                    { senderId: req.userId, receiverId: userId },
                    { senderId: userId, receiverId: req.userId },
                ],
            },
        });
        const block = await prisma.block.findFirst({
            where: {
                OR: [
                    { blockerId: req.userId, blockedId: userId },
                    { blockerId: userId, blockedId: req.userId },
                ],
            },
        });
        const msgBlock = await prisma.messageBlock.findFirst({
            where: {
                OR: [
                    { blockerId: req.userId, blockedId: userId },
                    { blockerId: userId, blockedId: req.userId },
                ],
            },
        });
        res.json({
            status: friendship?.status || null,
            isSender: friendship?.senderId === req.userId,
            friendshipId: friendship?.id || null,
            isBlocked: !!block,
            blockedByMe: block?.blockerId === req.userId,
            isMessageBlocked: !!msgBlock,
            messageBlockedByMe: msgBlock?.blockerId === req.userId,
        });
    } catch (error) { next(error); }
};
