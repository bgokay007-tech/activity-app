import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getArchive } from '../controllers/archive.controller.js';

const router = Router();
router.use(authenticate);
router.get('/', getArchive);

export default router;
