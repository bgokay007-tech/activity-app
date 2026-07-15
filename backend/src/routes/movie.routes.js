import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getNowPlayingMovies } from '../controllers/movie.controller.js';

const router = Router();
router.use(authenticate);

router.get('/now-playing', getNowPlayingMovies);

export default router;
