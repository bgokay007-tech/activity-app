import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    getRoutes, getRoute, createRoute, addRouteMedia, deleteRoute, reviewRoute,
    getMyVerification, submitVerification,
    getTrips, getTrip, createTrip, cancelTrip, requestJoin, cancelMyRequest, respondRequest,
} from '../controllers/travel.controller.js';

const router = Router();
router.use(authenticate);

router.get('/routes',               getRoutes);
router.post('/routes',              createRoute);
router.post('/routes/:id/media',    addRouteMedia);
router.post('/routes/:id/reviews',  reviewRoute);
router.delete('/routes/:id',        deleteRoute);
router.get('/routes/:id',           getRoute);

router.get('/verification',         getMyVerification);
router.post('/verification',        submitVerification);

router.get('/trips',                         getTrips);
router.post('/trips',                        createTrip);
router.patch('/trips/requests/:requestId',   respondRequest);
router.patch('/trips/:id/cancel',            cancelTrip);
router.post('/trips/:id/requests',           requestJoin);
router.delete('/trips/:id/requests/mine',    cancelMyRequest);
router.get('/trips/:id',                     getTrip);

export default router;
