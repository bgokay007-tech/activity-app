import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';
import {
    createVenue, getMyVenues, deleteVenue, updateIban,
    getVenueSlots, makeReservation, createManualReservation, getVenueReservations, cancelReservation,
    updateReservationStatus, rescheduleReservation,
    getMyReservations, getUnlistedReservations, getOwnerSchedule, getVenueAnalytics, updateVenueSettings,
    updateCourtSettings, searchVenues, searchVenueAvailability, getVenueById,
    getPendingVenues, approveVenue, rejectVenue,
    blockUser, unblockUser, getBlockedUsers,
    addMenuItem, updateMenuItem, deleteMenuItem, getVenueMenu,
    placeOrder, getVenueOrders, getUserOrders, updateOrderStatus,
    requestCancelReservation, approveCancelRequest, getCancelRequests,
} from '../controllers/venue.controller.js';
import {
    getVenueReviews, upsertVenueReview, upsertCourtReview, deleteVenueReview,
    createReviewAppeal, getMyVenueAppeals,
} from '../controllers/venueReview.controller.js';

const router = Router();
router.use(authenticate);

// İşletme sahibi — tesis
router.post('/',          createVenue);
router.get('/mine',       getMyVenues);
router.delete('/:id',     deleteVenue);
router.patch('/iban',     updateIban);
router.get('/:id/reservations',  getVenueReservations);
router.get('/:id/schedule',     getOwnerSchedule);
router.get('/:id/analytics',    getVenueAnalytics);
router.patch('/:id/settings',   updateVenueSettings);

// Engelleme
router.post('/:id/block',          blockUser);
router.delete('/:id/block/:userId', unblockUser);
router.get('/:id/blocked',         getBlockedUsers);

// Menü (sahip)
router.post('/:id/menu',            addMenuItem);
router.patch('/:id/menu/:itemId',   updateMenuItem);
router.delete('/:id/menu/:itemId',  deleteMenuItem);

// Siparişler (sahip)
router.get('/:id/orders',            getVenueOrders);
router.patch('/orders/:orderId',     updateOrderStatus);

// Genel (tüm kullanıcılar)
router.get('/search',                    searchVenues);
router.get('/search-availability',       searchVenueAvailability);
router.get('/reservations/mine',         getMyReservations);
router.get('/reservations/unlisted',     getUnlistedReservations);
router.get('/orders/mine',               getUserOrders);
router.delete('/reservations/:resId',    cancelReservation);
router.patch('/reservations/:resId/status',          updateReservationStatus);
router.patch('/reservations/:resId/reschedule',      rescheduleReservation);
router.post('/reservations/:resId/cancel-request',   requestCancelReservation);
router.post('/reservations/:resId/cancel-approve',   approveCancelRequest);
router.get('/reservations/cancel-requests',          getCancelRequests);
router.get('/:id/menu',                  getVenueMenu);
router.post('/:id/orders',               placeOrder);
router.get('/:id/courts/:courtId/slots', getVenueSlots);
router.post('/:id/courts/:courtId/reserve', makeReservation);
router.post('/:id/courts/:courtId/manual-reserve', createManualReservation);
router.patch('/:id/courts/:courtId/settings', updateCourtSettings);
// Yorumlar
router.get('/:id/reviews',                              getVenueReviews);
router.post('/:id/reviews',                             upsertVenueReview);
router.post('/:id/courts/:courtId/reviews',             upsertCourtReview);
router.delete('/:id/reviews/:reviewId',                 deleteVenueReview);
router.post('/:venueId/reviews/:reviewId/appeal',       createReviewAppeal);
router.get('/:venueId/reviews/appeals',                 getMyVenueAppeals);

router.get('/:id', getVenueById);

// Admin
router.get('/admin/pending',   requireAdmin, getPendingVenues);
router.patch('/:id/approve',   requireAdmin, approveVenue);
router.patch('/:id/reject',    requireAdmin, rejectVenue);

export default router;
