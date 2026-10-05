import { Router } from 'express';
import { getSportAnalysis } from '../controllers/sportAnalysis.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();
router.use(authenticate);
router.get('/:userId/:subCategory', getSportAnalysis);

export default router;
