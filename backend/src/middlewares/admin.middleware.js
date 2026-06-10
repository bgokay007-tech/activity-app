import prisma from '../config/prisma.js';

export const requireAdmin = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        if (!user?.isAdmin) return res.status(403).json({ message: 'Admin only' });
        next();
    } catch (error) {
        next(error);
    }
};
