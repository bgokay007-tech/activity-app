import { Router } from 'express';
import {
    getCategories,
    getUserInterests,
    getInterestsOf,
    addInterest,
    removeInterest,
    hideInterest,
    getUsersByCategory,
    getAssessmentQuestions,
    saveAssessment,
    toggleVoting,
    getVotes,
    submitVote,
    updateAlias,
} from '../controllers/interest.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/categories', getCategories);
router.get('/my', authenticate, getUserInterests);
router.get('/user/:userId', authenticate, getInterestsOf);
router.post('/add', authenticate, addInterest);
router.delete('/:id', authenticate, removeInterest);
router.patch('/:id/hide', authenticate, hideInterest);
router.get('/users', authenticate, getUsersByCategory);
router.get('/assessment/:subCategory', authenticate, getAssessmentQuestions);
router.patch('/:id/assess', authenticate, saveAssessment);
router.patch('/:id/alias', authenticate, updateAlias);
router.patch('/:id/voting', authenticate, toggleVoting);
router.get('/:id/votes', authenticate, getVotes);
router.post('/:id/vote', authenticate, submitVote);

export default router;