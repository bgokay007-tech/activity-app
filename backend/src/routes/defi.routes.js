import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    getDefiLadder, createDefiChallenge, respondDefiChallenge, cancelDefiChallenge,
    submitDefiScore, confirmDefiScore, finishDefiSeason,
} from '../controllers/defiLeague.controller.js';

const router = Router();
router.use(authenticate);
router.get('/:id', getDefiLadder);
router.post('/:id/challenge', createDefiChallenge);
router.post('/:id/challenges/:matchId/respond', respondDefiChallenge);
router.post('/:id/challenges/:matchId/cancel', cancelDefiChallenge);
router.post('/:id/challenges/:matchId/score', submitDefiScore);
router.post('/:id/challenges/:matchId/confirm', confirmDefiScore);
router.post('/:id/finish', finishDefiSeason);

export default router;
