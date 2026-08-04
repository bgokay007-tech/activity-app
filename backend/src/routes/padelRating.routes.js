import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getPadelRating, submitPadelRating } from '../controllers/padelRating.controller.js';

const router = Router();
router.use(authenticate);

router.get('/:subjectId',  getPadelRating);
router.post('/:subjectId', submitPadelRating);

export default router;
