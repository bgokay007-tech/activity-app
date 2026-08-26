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
    suggestCourtEdit,
    approveCourtEdit,
    rejectCourtEdit,
    getCourtRatings,
    upsertCourtRating,
} from '../controllers/court.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';

const router = Router();

// Admin routes must be before /:id to avoid conflict
router.get('/admin/pending',        authenticate, requireAdmin, getPendingCourts);
router.patch('/admin/:id/verify',   authenticate, requireAdmin, verifyCourt);
router.patch('/admin/:id/reject',   authenticate, requireAdmin, rejectCourt);
router.patch('/admin/:id/approve-edit', authenticate, requireAdmin, approveCourtEdit);
router.patch('/admin/:id/reject-edit',  authenticate, requireAdmin, rejectCourtEdit);

router.get('/',        authenticate, getAllCourts);
router.get('/search',  authenticate, searchCourts);
router.post('/', authenticate, addCourt);
router.post('/import-osm', authenticate, importFromOSM);
router.post('/:id/suggest-edit', authenticate, suggestCourtEdit);
router.get('/:id/ratings',  authenticate, getCourtRatings);
router.post('/:id/ratings', authenticate, upsertCourtRating);
router.get('/:id', authenticate, getCourt);
router.put('/:id', authenticate, updateCourt);
router.delete('/:id', authenticate, deleteCourt);

export default router;