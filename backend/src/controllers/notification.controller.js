import prisma from '../config/prisma.js';
import { emitToUser } from '../config/socket.js';
import axios from 'axios';

async function sendPush(pushToken, title, body, data = {}) {
    if (!pushToken?.startsWith('ExponentPushToken')) return;
    try {
        await axios.post('https://exp.host/--/api/v2/push/send', {
            to: pushToken, title, body, sound: 'default', data,
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
    } catch { /* push failure is non-critical */ }
}

export const getNotifications = async (req, res, next) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });
        const unreadCount = notifications.filter(n => !n.read).length;
        res.json({ notifications, unreadCount });
    } catch (error) { next(error); }
};

export const markAllRead = async (req, res, next) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.userId, read: false },
            data: { read: true },
        });
        res.json({ message: 'All marked as read' });
    } catch (error) { next(error); }
};

export const markOneRead = async (req, res, next) => {
    try {
        await prisma.notification.update({
            where: { id: req.params.id },
            data: { read: true },
        });
        res.json({ message: 'Marked as read' });
    } catch (error) { next(error); }
};

// Helper — called from other controllers
export async function createNotification(userId, type, title, body, data = {}) {
    try {
        const [notif, user] = await Promise.all([
            prisma.notification.create({ data: { userId, type, title, body, data } }),
            prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } }),
        ]);
        emitToUser(userId, 'notification', notif);
        if (user?.pushToken) sendPush(user.pushToken, title, body, data);
        return notif;
    } catch { /* non-critical */ }
}
