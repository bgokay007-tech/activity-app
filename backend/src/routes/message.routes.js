import { Router } from 'express';
import {
    getConversations, getUnreadMessageCount, getMessages, sendMessage, getOrStartConversation,
    muteConversation, unmuteConversation, markConversationRead,
} from '../controllers/message.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/conversations',                    authenticate, getConversations);
router.get('/unread-count',                     authenticate, getUnreadMessageCount);
router.get('/conversation/:userId',             authenticate, getOrStartConversation);
router.get('/conversation/:conversationId/messages', authenticate, getMessages);
router.post('/conversation/:conversationId/mute',      authenticate, muteConversation);
router.delete('/conversation/:conversationId/mute',    authenticate, unmuteConversation);
router.post('/conversation/:conversationId/mark-read', authenticate, markConversationRead);
router.post('/send/:userId',                    authenticate, sendMessage);

export default router;
