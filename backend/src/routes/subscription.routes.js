import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';
import {
    getMySubscription,
    submitSubscriptionRequest,
    cancelSubscription,
    getPendingRequests,
    approveRequest,
    rejectRequest,
} from '../controllers/subscription.controller.js';

const router = Router();
router.use(authenticate);

router.get('/me',            getMySubscription);
router.post('/request',      submitSubscriptionRequest);
router.delete('/cancel',     cancelSubscription);

// Admin
router.get('/requests',               requireAdmin, getPendingRequests);
router.patch('/requests/:id/approve', requireAdmin, approveRequest);
router.patch('/requests/:id/reject',  requireAdmin, rejectRequest);

export default router;
