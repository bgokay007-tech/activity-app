import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getWorldRankings } from '../controllers/sportGuide.controller.js';

const router = Router();
router.use(authenticate);
router.get('/rankings/:sub', getWorldRankings);

export default router;
