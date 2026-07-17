import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { searchMusic, getTrendingMusic, resolveTrackStream, getLikedTracks, likeTrack, unlikeTrack } from '../controllers/music.controller.js';

const router = Router();
router.use(authenticate);

router.get('/search',            searchMusic);
router.get('/trending',          getTrendingMusic);
router.get('/resolve',           resolveTrackStream);
router.get('/liked',             getLikedTracks);
router.post('/liked',            likeTrack);
router.delete('/liked/:trackId', unlikeTrack);

export default router;
