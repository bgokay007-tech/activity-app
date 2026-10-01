import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    getRoutes, getRoute, createRoute, addRouteMedia, deleteRoute, reviewRoute, getRouteGpx,
    addComment, deleteComment,
    getLists, createList, renameList, deleteList, getList, addListItem, removeListItem,
    getMyVerification, submitVerification,
    getTrips, getTrip, createTrip, cancelTrip, requestJoin, cancelMyRequest, respondRequest,
} from '../controllers/travel.controller.js';

const router = Router();
// Saat/harita uygulaması GPX'i tokensız açar — authenticate'ten önce.
router.get('/routes/:id/gpx',       getRouteGpx);
router.use(authenticate);

router.get('/routes',               getRoutes);
router.post('/routes',              createRoute);
router.post('/routes/:id/media',    addRouteMedia);
router.post('/routes/:id/reviews',  reviewRoute);
router.post('/routes/:id/comments', addComment);
router.delete('/comments/:id',      deleteComment);

router.get('/lists',                         getLists);
router.post('/lists',                        createList);
router.patch('/lists/:id',                   renameList);
router.delete('/lists/:id',                  deleteList);
router.get('/lists/:id',                     getList);
router.post('/lists/:id/items',              addListItem);
router.delete('/lists/:id/items/:routeId',   removeListItem);
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
