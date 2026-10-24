import { Router } from 'express';
import { getSportMedia } from '../controllers/sportMedia.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/:sport', authenticate, getSportMedia);

export default router;
