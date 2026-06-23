import { Router } from 'express';
import {
    getProfile, updateProfile, searchUsers,
    followUser, unfollowUser, removeFollower, respondFollowRequest,
    getFollowStatus, getFollowers, getFollowing, getPendingFollowRequests,
} from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/search',                  authenticate, searchUsers);
router.get('/me',                      authenticate, (req, res, next) => { req.params.userId = req.userId; getProfile(req, res, next); });
router.get('/follow-requests',         authenticate, getPendingFollowRequests);
router.get('/:userId/follow-status',   authenticate, getFollowStatus);
router.get('/:userId/followers',       authenticate, getFollowers);
router.get('/:userId/following',       authenticate, getFollowing);
router.post('/:userId/follow',         authenticate, followUser);
router.patch('/:userId/follow',        authenticate, respondFollowRequest);
router.delete('/:userId/follow',       authenticate, unfollowUser);
router.delete('/:userId/follower',     authenticate, removeFollower);
router.get('/:userId',                 authenticate, getProfile);
router.patch('/me',                    authenticate, updateProfile);

export default router;
