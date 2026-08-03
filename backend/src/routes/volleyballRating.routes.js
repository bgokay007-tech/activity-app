import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getVolleyballRating, submitVolleyballRating } from '../controllers/volleyballRating.controller.js';

const router = Router();
router.use(authenticate);

router.get('/:subjectId',  getVolleyballRating);
router.post('/:subjectId', submitVolleyballRating);

export default router;
