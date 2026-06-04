import prisma from '../config/prisma.js';

export const createRivalRequest = async (req, res, next) => {
    try {
        const { category, subCategory, message, level, location } = req.body;

        const request = await prisma.activityRequest.create({
            data: {
                senderId: req.userId,
                category,
                subCategory,
                message,
                level,
                location,
                status: 'OPEN',
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatar: true,
                    },
                },
            },
        });

        res.status(201).json(request);
    } catch (error) {
        next(error);
    }
};

export const getRivalRequests = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;

        const requests = await prisma.activityRequest.findMany({
            where: {
                category: category || undefined,
                subCategory: subCategory || undefined,
                status: 'OPEN',
                senderId: { not: req.userId },
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatar: true,
                        interests: {
                            where: {
                                category: category || undefined,
                                subCategory: subCategory || undefined,
                            },
                            select: {
                                level: true,
                                totalPoints: true,
                                wins: true,
                                losses: true,
                            },
                        },
                        cards: {
                            where: { category: category || undefined },
                            select: {
                                cardLevel: true,
                                power: true,
                                technique: true,
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        res.json(requests);
    } catch (error) {
        next(error);
    }
};

export const respondToRival = async (req, res, next) => {
    try {
        const { id } = req.params;

        const request = await prisma.activityRequest.findUnique({ where: { id } });

        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: {
                receiverId: req.userId,
                status: 'PENDING',
            },
        });

        res.json({ message: 'Challenge sent!', request: updated });
    } catch (error) {
        next(error);
    }
};

export const getMyRequests = async (req, res, next) => {
    try {
        const requests = await prisma.activityRequest.findMany({
            where: {
                OR: [
                    { senderId: req.userId },
                    { receiverId: req.userId },
                ],
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatar: true,
                    },
                },
                receiver: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatar: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(requests);
    } catch (error) {
        next(error);
    }
};