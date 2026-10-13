import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    createMatchVideo, markUploaded, listMatchVideos, getMatchVideo, retryMatchVideo, deleteMatchVideo,
} from '../controllers/matchVideo.controller.js';

const router = Router();
router.use(authenticate);
router.get('/', listMatchVideos);
router.post('/', createMatchVideo);
router.get('/:id', getMatchVideo);
router.post('/:id/uploaded', markUploaded);
router.post('/:id/retry', retryMatchVideo);
router.delete('/:id', deleteMatchVideo);

export default router;
