import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getMySubscription, activateSubscription, cancelSubscription } from '../controllers/subscription.controller.js';

const router = Router();
router.use(authenticate);

router.get('/me',     getMySubscription);
router.post('/activate', activateSubscription);
router.delete('/cancel', cancelSubscription);

export default router;
