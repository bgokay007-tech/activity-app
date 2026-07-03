import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';
import {
    createVenue, getMyVenues, deleteVenue, updateIban,
    getVenueSlots, makeReservation, getVenueReservations, cancelReservation,
    getMyReservations,
    searchVenues,
    getPendingVenues, approveVenue, rejectVenue,
} from '../controllers/venue.controller.js';

const router = Router();
router.use(authenticate);

// İşletme sahibi
router.post('/',          createVenue);
router.get('/mine',       getMyVenues);
router.delete('/:id',     deleteVenue);
router.get('/:id/reservations', getVenueReservations);
router.patch('/iban',     updateIban);

// Genel (tüm kullanıcılar)
router.get('/search',     searchVenues);
router.get('/:id/courts/:courtId/slots', getVenueSlots);
router.post('/:id/courts/:courtId/reserve', makeReservation);
router.get('/reservations/mine',     getMyReservations);
router.delete('/reservations/:resId', cancelReservation);

// Admin
router.get('/admin/pending',   requireAdmin, getPendingVenues);
router.patch('/:id/approve',   requireAdmin, approveVenue);
router.patch('/:id/reject',    requireAdmin, rejectVenue);

export default router;
