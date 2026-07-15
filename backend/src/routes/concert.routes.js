import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { searchConcerts } from '../controllers/concert.controller.js';

const router = Router();
router.use(authenticate);

router.get('/search', searchConcerts);

export default router;
