import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getListings, createListing, deleteListing } from '../controllers/equipment.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',       getListings);
router.post('/',      createListing);
router.delete('/:id', deleteListing);

export default router;
