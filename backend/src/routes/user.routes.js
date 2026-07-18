import { Router } from 'express';
import {
    getProfile, updateProfile, searchUsers, getUsersBySport,
    followUser, unfollowUser, removeFollower, respondFollowRequest,
    getFollowStatus, getFollowers, getFollowing, getPendingFollowRequests,
    submitProfileChangeRequest, getMyProfileChangeRequests,
    submitSupportMessage, getMySupportMessages,
} from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/search',                  authenticate, searchUsers);
router.get('/by-sport',                authenticate, getUsersBySport);
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
router.post('/me',                     authenticate, updateProfile);
router.post('/me/change-requests',     authenticate, submitProfileChangeRequest);
router.get('/me/change-requests',      authenticate, getMyProfileChangeRequests);
router.post('/me/support-messages',    authenticate, submitSupportMessage);
router.get('/me/support-messages',     authenticate, getMySupportMessages);

export default router;
