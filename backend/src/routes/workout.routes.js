import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    listMyPlans, listAuthoredPlans, getPlan, createPlan, updatePlan, deletePlan,
    getOrCreateSession, upsertSetLog, completeSession, listCoachStudents,
} from '../controllers/workout.controller.js';

const router = Router();
router.use(authenticate);

router.get('/plans', listMyPlans);
router.get('/plans/authored', listAuthoredPlans);
router.post('/plans', createPlan);
router.get('/plans/:id', getPlan);
router.patch('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);

router.post('/plans/:id/session', getOrCreateSession);
router.get('/plans/:id/session', getOrCreateSession);

router.post('/sessions/:sessionId/sets', upsertSetLog);
router.patch('/sessions/:sessionId/complete', completeSession);

router.get('/coach-students', listCoachStudents);

export default router;
