import { Router } from 'express';
import { chat } from '../controllers/aiReferee.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/chat', authenticate, chat);

export default router;
