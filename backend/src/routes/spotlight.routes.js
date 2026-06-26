import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getDailySpotlight } from '../controllers/spotlight.controller.js';

const router = Router();
router.use(authenticate);

router.get('/daily', getDailySpotlight);

export default router;
