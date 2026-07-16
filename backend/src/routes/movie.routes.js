import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { getNowPlayingMovies, getClassicFilms, getClassicFilmStream } from '../controllers/movie.controller.js';

const router = Router();
router.use(authenticate);

router.get('/now-playing', getNowPlayingMovies);
router.get('/classics', getClassicFilms);
router.get('/classics/:id/stream', getClassicFilmStream);

export default router;
