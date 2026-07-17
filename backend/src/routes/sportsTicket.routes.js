import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { searchSportsTickets } from '../controllers/sportsTicket.controller.js';

const router = Router();
router.use(authenticate);

router.get('/search', searchSportsTickets);

export default router;
