import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { searchTheaterEvents } from '../controllers/theater.controller.js';

const router = Router();
router.use(authenticate);

router.get('/search', searchTheaterEvents);

export default router;
