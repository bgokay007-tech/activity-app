import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getMyAlert, toggleAlert } from '../controllers/cityAlert.controller.js';

const router = Router();
router.use(authenticate);
router.get('/:subCategory', getMyAlert);
router.post('/', toggleAlert);

export default router;
