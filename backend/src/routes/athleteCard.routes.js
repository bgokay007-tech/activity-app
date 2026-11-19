import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    getMyAthleteCard,
    getMetricHistory,
    upsertAthleteMetrics,
    deleteAthleteMetric,
} from '../controllers/athleteCard.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', getMyAthleteCard);
router.get('/history/:key', getMetricHistory);
router.post('/', upsertAthleteMetrics);
router.delete('/:id', deleteAthleteMetric);

export default router;
