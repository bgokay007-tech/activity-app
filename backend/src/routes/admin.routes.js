import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';
import {
    getStats, getUsers, updateUser, deleteUser,
    getDisputes, resolveDispute,
    getAllCourts, deleteCourt,
    getAllPosts, deletePost,
    getTournamentPermissionRequests, approveTournamentPermission, rejectTournamentPermission,
} from '../controllers/admin.controller.js';
import { getNoShowReports, approveNoShow, rejectNoShow } from '../controllers/noshow.controller.js';
import { adminGetCities, adminUpdateCity } from '../controllers/city.controller.js';

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
router.get('/no-show-reports',            getNoShowReports);
router.patch('/no-show-reports/:id/approve', approveNoShow);
router.patch('/no-show-reports/:id/reject',  rejectNoShow);
router.get('/cities',        adminGetCities);
router.patch('/cities/:id',  adminUpdateCity);
router.get('/tournament-permissions',                  getTournamentPermissionRequests);
router.patch('/tournament-permissions/:userId/approve', approveTournamentPermission);
router.patch('/tournament-permissions/:userId/reject',  rejectTournamentPermission);

export default router;
