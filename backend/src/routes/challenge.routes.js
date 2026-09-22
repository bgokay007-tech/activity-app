import { Router } from 'express';
import {
    createChallenge, respondChallenge, proposeChallengeSchedule,
    acceptChallengeSchedule, getChallenge,
} from '../controllers/challenge.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/', authenticate, createChallenge);
router.get('/:id', authenticate, getChallenge);
router.patch('/:id/respond', authenticate, respondChallenge);
router.post('/:id/propose-schedule', authenticate, proposeChallengeSchedule);
router.post('/:id/accept-schedule', authenticate, acceptChallengeSchedule);

export default router;
