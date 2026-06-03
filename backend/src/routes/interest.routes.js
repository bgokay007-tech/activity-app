import { Router } from 'express';
import {
    getCategories,
    getUserInterests,
    addInterest,
    removeInterest,
    getUsersByCategory,
} from '../controllers/interest.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/categories', getCategories);
router.get('/my', authenticate, getUserInterests);
router.post('/add', authenticate, addInterest);
router.delete('/:id', authenticate, removeInterest);
router.get('/users', authenticate, getUsersByCategory);

export default router;