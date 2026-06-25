import { Router } from 'express';
import { getListings, createListing, updateListing, deleteListing } from '../controllers/coach.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { reportListing } from '../controllers/listing-report.controller.js';

const router = Router();

router.get('/',              authenticate, getListings);
router.post('/',             authenticate, createListing);
router.post('/:id/report',   authenticate, (req, res, next) => { req.params.type = 'coach'; reportListing(req, res, next); });
router.patch('/:id',         authenticate, updateListing);
router.delete('/:id',        authenticate, deleteListing);

export default router;
