import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    getListings, getListing, createListing, deleteListing,
    sendOffer, getOffers, respondOffer, cancelReservation, markSold, getListingContacts, confirmSold,
} from '../controllers/equipment.controller.js';
import {
    listStores, getStore, createStore, syncStore, deleteStore, searchStoreProducts,
} from '../controllers/equipmentStore.controller.js';
import { reportListing } from '../controllers/listing-report.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',              getListings);
router.post('/',             createListing);

// Mağazalar — /:id'den ÖNCE
router.get('/stores/products', searchStoreProducts);
router.get('/stores',          listStores);
router.post('/stores',         createStore);
router.get('/stores/:id',      getStore);
router.post('/stores/:id/sync', syncStore);
router.delete('/stores/:id',   deleteStore);

router.post('/:id/report',   (req, res, next) => { req.params.type = 'equipment'; reportListing(req, res, next); });
router.delete('/:id',        deleteListing);

router.post('/:id/offers',       sendOffer);
router.get('/:id/offers',        getOffers);
router.patch('/offers/:offerId', respondOffer);
router.patch('/:id/unreserve',   cancelReservation);
router.patch('/:id/sold',        markSold);
router.patch('/:id/confirm-sold', confirmSold);
router.get('/:id/contacts',      getListingContacts);
router.get('/:id',           getListing);

export default router;
