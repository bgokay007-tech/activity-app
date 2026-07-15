import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    getMyPlaylists, createPlaylist, updatePlaylist, deletePlaylist,
    addTrackToPlaylist, removeTrackFromPlaylist,
} from '../controllers/playlist.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',                    getMyPlaylists);
router.post('/',                   createPlaylist);
router.patch('/:id',               updatePlaylist);
router.delete('/:id',              deletePlaylist);
router.post('/:id/tracks',         addTrackToPlaylist);
router.delete('/:id/tracks/:trackId', removeTrackFromPlaylist);

export default router;
