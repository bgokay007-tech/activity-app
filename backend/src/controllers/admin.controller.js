import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';

export const getStats = async (req, res, next) => {
    try {
        const [users, matches, courts, disputes, posts] = await Promise.all([
            prisma.user.count(),
            prisma.activityRequest.count(),
            prisma.court.count(),
            prisma.activityRequest.count({ where: { scoreStatus: 'DISPUTED' } }),
            prisma.post.count(),
        ]);
        const pending = await prisma.court.count({ where: { pending: true } });
        const archived = await prisma.activityRequest.count({ where: { scoreStatus: 'CONFIRMED' } });
        res.json({ users, matches, courts, disputes, posts, pendingCourts: pending, archivedMatches: archived });
    } catch (e) { next(e); }
};

export const getUsers = async (req, res, next) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true, username: true, fullName: true, email: true,
                isAdmin: true, isPublic: true, createdAt: true,
                _count: { select: { posts: true, sentRequests: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(users);
    } catch (e) { next(e); }
};

export const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isAdmin, isPublic } = req.body;
        if (id === req.userId) return res.status(400).json({ message: 'Cannot edit your own admin status' });
        const user = await prisma.user.update({
            where: { id },
            data: { ...(isAdmin !== undefined && { isAdmin }), ...(isPublic !== undefined && { isPublic }) },
            select: { id: true, username: true, isAdmin: true, isPublic: true },
        });
        res.json(user);
    } catch (e) { next(e); }
};

export const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (id === req.userId) return res.status(400).json({ message: 'Cannot delete yourself' });
        await prisma.user.delete({ where: { id } });
        res.json({ message: 'User deleted' });
    } catch (e) { next(e); }
};

export const getDisputes = async (req, res, next) => {
    try {
        const disputes = await prisma.activityRequest.findMany({
            where: { scoreStatus: 'DISPUTED' },
            include: {
                sender: { select: { id: true, username: true, fullName: true } },
                receiver: { select: { id: true, username: true, fullName: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(disputes);
    } catch (e) { next(e); }
};

export const resolveDispute = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { winner } = req.body; // 'sender' | 'receiver' | 'draw'
        const match = await prisma.activityRequest.findUnique({ where: { id } });
        if (!match) return res.status(404).json({ message: 'Match not found' });

        const updatedScore = { ...(match.score || {}), winner, adminResolved: true };
        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { scoreStatus: 'CONFIRMED', score: updatedScore },
        });
        res.json(updated);
    } catch (e) { next(e); }
};

export const getAllCourts = async (req, res, next) => {
    try {
        const courts = await prisma.court.findMany({
            include: { user: { select: { id: true, username: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(courts);
    } catch (e) { next(e); }
};

export const deleteCourt = async (req, res, next) => {
    try {
        await prisma.court.delete({ where: { id: req.params.id } });
        res.json({ message: 'Court deleted' });
    } catch (e) { next(e); }
};

export const getAllPosts = async (req, res, next) => {
    try {
        const posts = await prisma.post.findMany({
            include: { user: { select: { id: true, username: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        res.json(posts);
    } catch (e) { next(e); }
};

export const deletePost = async (req, res, next) => {
    try {
        await prisma.post.delete({ where: { id: req.params.id } });
        res.json({ message: 'Post deleted' });
    } catch (e) { next(e); }
};

export const getTournamentPermissionRequests = async (req, res, next) => {
    try {
        const requests = await prisma.tournamentPermissionRequest.findMany({
            where: { status: 'PENDING' },
            include: { user: { select: { id: true, username: true, fullName: true, avatar: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests);
    } catch (e) { next(e); }
};

export const approveTournamentPermission = async (req, res, next) => {
    try {
        const { userId } = req.params;
        await prisma.tournamentPermissionRequest.update({ where: { userId }, data: { status: 'APPROVED' } });
        createNotification(userId, 'TOURNAMENT_PERMISSION_APPROVED',
            '✅ Turnuva İzni Onaylandı',
            'Tebrikler! Artık turnuva oluşturabilirsiniz.',
            {}
        ).catch(() => {});
        res.json({ message: 'Approved' });
    } catch (e) { next(e); }
};

export const rejectTournamentPermission = async (req, res, next) => {
    try {
        const { userId } = req.params;
        await prisma.tournamentPermissionRequest.update({
            where: { userId },
            data: { status: 'REJECTED' },
        });
        createNotification(userId, 'TOURNAMENT_PERMISSION_REJECTED',
            '❌ Turnuva İzni Reddedildi',
            'Turnuva oluşturma talebiniz reddedildi.',
            {}
        ).catch(() => {});
        res.json({ message: 'Rejected' });
    } catch (e) { next(e); }
};
