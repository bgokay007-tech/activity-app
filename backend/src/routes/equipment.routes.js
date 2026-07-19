import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    getListings, getListing, createListing, deleteListing,
    sendOffer, getOffers, respondOffer, cancelReservation, markSold,
} from '../controllers/equipment.controller.js';
import { reportListing } from '../controllers/listing-report.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',              getListings);
router.post('/',             createListing);
router.post('/:id/report',   (req, res, next) => { req.params.type = 'equipment'; reportListing(req, res, next); });
router.delete('/:id',        deleteListing);

router.post('/:id/offers',       sendOffer);
router.get('/:id/offers',        getOffers);
router.patch('/offers/:offerId', respondOffer);
router.patch('/:id/unreserve',   cancelReservation);
router.patch('/:id/sold',        markSold);
router.get('/:id',           getListing);

export default router;
