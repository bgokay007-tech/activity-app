import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getMyActivityAlert, upsertMyActivityAlert } from '../controllers/activityAlert.controller.js';

const router = Router();
router.use(authenticate);
router.get('/me', getMyActivityAlert);
router.put('/me', upsertMyActivityAlert);

export default router;
