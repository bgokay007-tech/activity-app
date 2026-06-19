import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getCities, submitCity } from '../controllers/city.controller.js';

const router = Router();

router.get('/', getCities);
router.post('/', authenticate, submitCity);

export default router;
