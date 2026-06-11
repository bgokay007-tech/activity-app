import { Router } from 'express';
import { register, login, getMe, sendOtp, verifyOtp } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import prisma from '../config/prisma.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

// one-time admin setup — DELETE after use
router.post('/setup-admin', async (req, res) => {
    if (req.body.secret !== 'activity-setup-2026') return res.status(403).json({ message: 'forbidden' });
    const r = await prisma.user.updateMany({ where: { email: req.body.email }, data: { isAdmin: true } });
    res.json({ updated: r.count });
});

export default router;
