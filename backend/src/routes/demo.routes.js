import { Router } from 'express';
import { seedDemoFootballJoinRequests, seedOneTournamentJoin, seedRivalDemoJoin, seedVolleyballDemoJoin } from '../controllers/demo.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();
router.post('/football-join',      authenticate, seedDemoFootballJoinRequests);
router.post('/tournament-join',    authenticate, seedOneTournamentJoin);
router.post('/rival-join',         authenticate, seedRivalDemoJoin);
router.post('/volleyball-join',    authenticate, seedVolleyballDemoJoin);

export default router;
