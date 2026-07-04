import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';
import {
    createVenue, getMyVenues, deleteVenue, updateIban,
    getVenueSlots, makeReservation, getVenueReservations, cancelReservation,
    getMyReservations, getOwnerSchedule,
    searchVenues,
    getPendingVenues, approveVenue, rejectVenue,
    blockUser, unblockUser, getBlockedUsers,
    addMenuItem, updateMenuItem, deleteMenuItem, getVenueMenu,
    placeOrder, getVenueOrders, getUserOrders, updateOrderStatus,
} from '../controllers/venue.controller.js';

const router = Router();
router.use(authenticate);

// İşletme sahibi — tesis
router.post('/',          createVenue);
router.get('/mine',       getMyVenues);
router.delete('/:id',     deleteVenue);
router.patch('/iban',     updateIban);
router.get('/:id/reservations', getVenueReservations);
router.get('/:id/schedule',    getOwnerSchedule);

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
router.get('/reservations/mine',         getMyReservations);
router.get('/orders/mine',               getUserOrders);
router.delete('/reservations/:resId',    cancelReservation);
router.get('/:id/menu',                  getVenueMenu);
router.post('/:id/orders',               placeOrder);
router.get('/:id/courts/:courtId/slots', getVenueSlots);
router.post('/:id/courts/:courtId/reserve', makeReservation);

// Admin
router.get('/admin/pending',   requireAdmin, getPendingVenues);
router.patch('/:id/approve',   requireAdmin, approveVenue);
router.patch('/:id/reject',    requireAdmin, rejectVenue);

export default router;
