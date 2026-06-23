import { Router } from 'express';
import { register, login, getMe, sendOtp, verifyOtp, forgotPassword, resetPassword } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import prisma from '../config/prisma.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

router.post('/push-token', authenticate, async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'token required' });
    await prisma.$transaction([
        prisma.user.updateMany({ where: { pushToken: token, id: { not: req.userId } }, data: { pushToken: null } }),
        prisma.user.update({ where: { id: req.userId }, data: { pushToken: token } }),
    ]);
    res.json({ ok: true });
});


export default router;
