import { Router } from 'express';
import { getSurvey, submitSurvey } from '../controllers/survey.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();
router.use(authenticate);
router.get('/:subjectId/:subCategory', getSurvey);
router.post('/:subjectId/:subCategory', submitSurvey);

export default router;
