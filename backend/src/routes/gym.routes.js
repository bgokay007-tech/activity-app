import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    getListings, getListing, createListing, updateListing, deleteListing,
    applyMembership, getMembershipApplications, respondMembershipApplication,
    getMyMembershipQr, scanCheck, getCheckIns,
    getMyMemberships, leaveMembership,
    getReviews, submitReview,
} from '../controllers/gym.controller.js';
import { reportListing } from '../controllers/listing-report.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', getListings);
router.post('/', createListing);

// Sabit yollar :id'den ÖNCE
router.get('/my-memberships', getMyMemberships);
router.patch('/membership-applications/:reqId', respondMembershipApplication);

router.post('/:id/report', (req, res, next) => { req.params.type = 'gym'; reportListing(req, res, next); });
router.post('/:id/membership-apply', applyMembership);
router.post('/:id/membership-leave', leaveMembership);
router.get('/:id/membership-applications', getMembershipApplications);
router.get('/:id/my-qr', getMyMembershipQr);
router.post('/:id/scan', scanCheck);
router.get('/:id/check-ins', getCheckIns);
router.get('/:id/reviews', getReviews);
router.post('/:id/reviews', submitReview);

router.patch('/:id', updateListing);
router.delete('/:id', deleteListing);
router.get('/:id', getListing);

export default router;
