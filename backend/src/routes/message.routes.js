import { Router } from 'express';
import { getConversations, getMessages, sendMessage, getOrStartConversation } from '../controllers/message.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/conversations',                    authenticate, getConversations);
router.get('/conversation/:userId',             authenticate, getOrStartConversation);
router.get('/conversation/:conversationId/messages', authenticate, getMessages);
router.post('/send/:userId',                    authenticate, sendMessage);

export default router;
