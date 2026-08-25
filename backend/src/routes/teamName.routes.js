import { Router } from 'express';
import { getMyTeamNameRequest, submitTeamNameRequest } from '../controllers/teamName.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/mine', authenticate, getMyTeamNameRequest);
router.post('/', authenticate, submitTeamNameRequest);

export default router;
