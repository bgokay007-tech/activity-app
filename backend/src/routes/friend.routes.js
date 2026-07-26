import { Router } from 'express';
import {
    sendRequest, respondRequest, unfriend,
    blockUser, unblockUser,
    blockMessages, unblockMessages, getMessageBlockList,
    getFriends, getFriendsOf, getPendingRequests, getBlockList, getFriendshipStatus,
} from '../controllers/friend.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/',                     authenticate, getFriends);
router.get('/list/:userId',         authenticate, getFriendsOf);
router.get('/requests',             authenticate, getPendingRequests);
router.get('/blocked',              authenticate, getBlockList);
router.get('/status/:userId',       authenticate, getFriendshipStatus);
router.post('/request/:userId',     authenticate, sendRequest);
router.patch('/request/:id',        authenticate, respondRequest);
router.delete('/unfriend/:userId',  authenticate, unfriend);
router.post('/block/:userId',       authenticate, blockUser);
router.delete('/block/:userId',     authenticate, unblockUser);
router.get('/message-blocked',           authenticate, getMessageBlockList);
router.post('/message-block/:userId',    authenticate, blockMessages);
router.delete('/message-block/:userId',  authenticate, unblockMessages);

export default router;
