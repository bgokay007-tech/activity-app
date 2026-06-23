import { Router } from 'express';
import { getProfile, updateProfile, searchUsers, followUser, unfollowUser, getFollowStatus } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/search',       authenticate, searchUsers);
router.get('/me',           authenticate, (req, res, next) => { req.params.userId = req.userId; getProfile(req, res, next); });
router.get('/:userId/follow-status', authenticate, getFollowStatus);
router.post('/:userId/follow',       authenticate, followUser);
router.delete('/:userId/follow',     authenticate, unfollowUser);
router.get('/:userId',      authenticate, getProfile);
router.patch('/me',         authenticate, updateProfile);

export default router;
