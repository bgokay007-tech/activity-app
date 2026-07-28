import { Router } from 'express';
import {
    getTrails,
    getTrailById,
    createTrail,
    updateTrail,
    deleteTrail,
    upsertTrailReview,
    addTrailComment,
} from '../controllers/trail.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/',              authenticate, getTrails);
router.get('/:id',           authenticate, getTrailById);
router.post('/',             authenticate, createTrail);
router.patch('/:id',         authenticate, updateTrail);
router.delete('/:id',        authenticate, deleteTrail);
router.post('/:id/reviews',  authenticate, upsertTrailReview);
router.post('/:id/comments', authenticate, addTrailComment);

export default router;
