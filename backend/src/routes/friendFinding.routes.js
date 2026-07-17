import { Router } from 'express';
import {
    updateLocation,
    getSeekingQuestionHandler, getSurveyQuestions, submitSurvey,
    getMyProfile, updatePrefs,
    getCandidates, swipe,
    getMatches, unmatch,
} from '../controllers/friendFinding.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/location', authenticate, updateLocation);

router.get('/survey/seeking-question', authenticate, getSeekingQuestionHandler);
router.get('/survey', authenticate, getSurveyQuestions);
router.post('/survey/submit', authenticate, submitSurvey);

router.get('/profile', authenticate, getMyProfile);
router.patch('/profile', authenticate, updatePrefs);

router.get('/candidates', authenticate, getCandidates);
router.post('/swipe', authenticate, swipe);

router.get('/matches', authenticate, getMatches);
router.delete('/matches/:id', authenticate, unmatch);

export default router;
