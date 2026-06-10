import { Router } from 'express';
import { getNotifications, markAllRead, markOneRead } from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/',           authenticate, getNotifications);
router.patch('/read-all', authenticate, markAllRead);
router.patch('/:id/read', authenticate, markOneRead);

export default router;
