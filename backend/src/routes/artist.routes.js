import { Router } from 'express';
import {
    getListings, getListing, getMyListing, upsertMyListing, deleteMyListing,
} from '../controllers/artist.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();
router.use(authenticate);

router.get('/',        getListings);
router.get('/mine',    getMyListing);
router.post('/mine',   upsertMyListing);
router.delete('/mine', deleteMyListing);
router.get('/:id',     getListing);

export default router;
