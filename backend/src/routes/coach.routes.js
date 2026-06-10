import { Router } from 'express';
import { getListings, createListing, deleteListing } from '../controllers/coach.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/',      authenticate, getListings);
router.post('/',     authenticate, createListing);
router.delete('/:id', authenticate, deleteListing);

export default router;
