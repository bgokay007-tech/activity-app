import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getAchievements, addAchievement, deleteAchievement } from '../controllers/achievement.controller.js';

const router = Router();
router.use(authenticate);

router.get('/:userId',  getAchievements);
router.post('/',        addAchievement);
router.delete('/:id',   deleteAchievement);

export default router;
