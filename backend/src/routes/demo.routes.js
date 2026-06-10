import { Router } from 'express';
import { seedDemoFootballJoinRequests, seedOneTournamentJoin } from '../controllers/demo.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();
router.post('/football-join',      authenticate, seedDemoFootballJoinRequests);
router.post('/tournament-join',    authenticate, seedOneTournamentJoin);

export default router;
