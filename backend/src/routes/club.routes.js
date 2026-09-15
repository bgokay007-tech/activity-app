import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    getListings, getListing, createListing, updateListing, deleteListing,
    applyMembership, getMembershipApplications, respondMembershipApplication,
} from '../controllers/club.controller.js';
import { reportListing } from '../controllers/listing-report.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', getListings);
router.post('/', createListing);
// Sabit yollar :id'den ÖNCE — aksi halde "membership-applications" id sanılır.
router.patch('/membership-applications/:reqId', respondMembershipApplication);
router.post('/:id/report', (req, res, next) => { req.params.type = 'club'; reportListing(req, res, next); });
router.post('/:id/membership-apply', applyMembership);
router.get('/:id/membership-applications', getMembershipApplications);
router.patch('/:id', updateListing);
router.delete('/:id', deleteListing);
router.get('/:id', getListing);

export default router;
