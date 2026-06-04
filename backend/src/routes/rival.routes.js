import { Router } from 'express';
import {
    createRivalRequest,
    getRivalRequests,
    respondToRival,
    getMyRequests,
} from '../controllers/rival.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authenticate, getRivalRequests);
router.post('/', authenticate, createRivalRequest);
router.post('/:id/respond', authenticate, respondToRival);
router.get('/my', authenticate, getMyRequests);

export default router;