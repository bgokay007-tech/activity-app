import prisma from '../config/prisma.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

async function getOrCreateConversation(user1Id, user2Id) {
    const [a, b] = [user1Id, user2Id].sort();
    return prisma.conversation.upsert({
        where: { user1Id_user2Id: { user1Id: a, user2Id: b } },
        create: { user1Id: a, user2Id: b },
        update: { updatedAt: new Date() },
        include: {
            user1: { select: USER_SELECT },
            user2: { select: USER_SELECT },
        },
    });
}

export const getConversations = async (req, res, next) => {
    try {
        const conversations = await prisma.conversation.findMany({
            where: { OR: [{ user1Id: req.userId }, { user2Id: req.userId }] },
            include: {
                user1: { select: USER_SELECT },
                user2: { select: USER_SELECT },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const result = conversations.map(c => ({
            ...c,
            other: c.user1Id === req.userId ? c.user2 : c.user1,
            lastMessage: c.messages[0] || null,
            unreadCount: 0,
        }));

        res.json(result);
    } catch (error) { next(error); }
};

export const getMessages = async (req, res, next) => {
    try {
        const { conversationId } = req.params;

        const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conv || (conv.user1Id !== req.userId && conv.user2Id !== req.userId))
            return res.status(403).json({ message: 'Forbidden' });

        const messages = await prisma.message.findMany({
            where: { conversationId },
            include: { sender: { select: USER_SELECT } },
            orderBy: { createdAt: 'asc' },
        });

        // Mark as read
        await prisma.message.updateMany({
            where: { conversationId, senderId: { not: req.userId }, read: false },
            data: { read: true },
        });

        res.json(messages);
    } catch (error) { next(error); }
};

export const sendMessage = async (req, res, next) => {
    try {
        const { userId: receiverId } = req.params;
        const { content } = req.body;

        if (!content?.trim()) return res.status(400).json({ message: 'Message cannot be empty' });

        const blocked = await prisma.block.findFirst({
            where: { OR: [{ blockerId: req.userId, blockedId: receiverId }, { blockerId: receiverId, blockedId: req.userId }] },
        });
        if (blocked) return res.status(403).json({ message: 'Cannot message this user' });

        const conv = await getOrCreateConversation(req.userId, receiverId);

        const message = await prisma.message.create({
            data: { conversationId: conv.id, senderId: req.userId, content: content.trim() },
            include: { sender: { select: USER_SELECT } },
        });

        await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });

        res.status(201).json({ message, conversationId: conv.id });
    } catch (error) { next(error); }
};

export const getOrStartConversation = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const conv = await getOrCreateConversation(req.userId, userId);
        res.json(conv);
    } catch (error) { next(error); }
};
