import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getRacquetFeedback, submitRacquetFeedback } from '../controllers/racquetFeedback.controller.js';

const router = Router();
router.use(authenticate);
router.get('/:subCategory/:subjectId', getRacquetFeedback);
router.post('/:subCategory/:subjectId', submitRacquetFeedback);

export default router;
