import { Router } from 'express';
import { getNotifications, markAllRead, markOneRead, markMyScoreEntryRequiredRead } from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/',           authenticate, getNotifications);
router.patch('/read-all', authenticate, markAllRead);
// /:id/read'ten ÖNCE — yoksa "score-entry-read" id sanılır
router.patch('/score-entry-read', authenticate, markMyScoreEntryRequiredRead);
router.patch('/:id/read', authenticate, markOneRead);

export default router;
