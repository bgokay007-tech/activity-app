import { Router } from 'express';
import {
    getListings, createListing, updateListing, deleteListing,
    requestLesson, getLessonRequests, respondLessonRequest,
    getReviews, submitReview,
} from '../controllers/coach.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { reportListing } from '../controllers/listing-report.controller.js';

const router = Router();

router.get('/',              authenticate, getListings);
router.post('/',             authenticate, createListing);
router.post('/:id/report',   authenticate, (req, res, next) => { req.params.type = 'coach'; reportListing(req, res, next); });
router.patch('/:id',         authenticate, updateListing);
router.delete('/:id',        authenticate, deleteListing);

router.post('/:id/lesson-request',            authenticate, requestLesson);
router.get('/:id/lesson-requests',            authenticate, getLessonRequests);
router.patch('/lesson-requests/:reqId',       authenticate, respondLessonRequest);
router.get('/:id/reviews',                    authenticate, getReviews);
router.post('/:id/reviews',                   authenticate, submitReview);

export default router;
