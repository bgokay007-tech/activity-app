import { Router } from 'express';
import { getNews } from '../controllers/news.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/:sport', authenticate, getNews);

export default router;
