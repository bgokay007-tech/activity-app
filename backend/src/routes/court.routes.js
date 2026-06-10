import { Router } from 'express';
import {
    getAllCourts,
    addCourt,
    searchCourts,
    getCourt,
    updateCourt,
    deleteCourt,
    importFromOSM,
    getPendingCourts,
    verifyCourt,
    rejectCourt,
} from '../controllers/court.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';

const router = Router();

// Admin routes must be before /:id to avoid conflict
router.get('/admin/pending',        authenticate, requireAdmin, getPendingCourts);
router.patch('/admin/:id/verify',   authenticate, requireAdmin, verifyCourt);
router.patch('/admin/:id/reject',   authenticate, requireAdmin, rejectCourt);

router.get('/',        authenticate, getAllCourts);
router.get('/search',  authenticate, searchCourts);
router.post('/', authenticate, addCourt);
router.post('/import-osm', authenticate, importFromOSM);
router.get('/:id', authenticate, getCourt);
router.put('/:id', authenticate, updateCourt);
router.delete('/:id', authenticate, deleteCourt);

export default router;