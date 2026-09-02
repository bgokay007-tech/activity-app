import { Router } from 'express';
import { createLinkToken, unlinkTelegram, telegramWebhook } from '../controllers/telegram.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/link-token', authenticate, createLinkToken);
router.post('/unlink', authenticate, unlinkTelegram);
router.post('/webhook', telegramWebhook); // Telegram tarafından çağrılır, kullanıcı auth'u yok

export default router;
