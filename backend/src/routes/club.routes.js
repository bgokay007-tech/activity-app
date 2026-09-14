import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    getListings, getListing, createListing, updateListing, deleteListing,
} from '../controllers/club.controller.js';
import { reportListing } from '../controllers/listing-report.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', getListings);
router.post('/', createListing);
router.post('/:id/report', (req, res, next) => { req.params.type = 'club'; reportListing(req, res, next); });
router.patch('/:id', updateListing);
router.delete('/:id', deleteListing);
router.get('/:id', getListing);

export default router;
