import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';
import {
    getStats, getUsers, updateUser, deleteUser,
    getDisputes, resolveDispute,
    getAllCourts, deleteCourt,
    getAllPosts, deletePost,
} from '../controllers/admin.controller.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/stats',              getStats);
router.get('/users',              getUsers);
router.patch('/users/:id',        updateUser);
router.delete('/users/:id',       deleteUser);
router.get('/disputes',           getDisputes);
router.patch('/disputes/:id/resolve', resolveDispute);
router.get('/courts',             getAllCourts);
router.delete('/courts/:id',      deleteCourt);
router.get('/posts',              getAllPosts);
router.delete('/posts/:id',       deletePost);

export default router;
