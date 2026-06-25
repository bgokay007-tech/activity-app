import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getListings, createListing, deleteListing } from '../controllers/equipment.controller.js';
import { reportListing } from '../controllers/listing-report.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',              getListings);
router.post('/',             createListing);
router.post('/:id/report',   (req, res, next) => { req.params.type = 'equipment'; reportListing(req, res, next); });
router.delete('/:id',        deleteListing);

export default router;
