import { Router } from 'express';
import { getRivalSharePage, getTournamentSharePage, getPostSharePage, getMatchSharePage } from '../controllers/share.controller.js';

// Auth YOK — WhatsApp/Telegram/Instagram önizleme botları ve link'e tıklayan
// (uygulaması olsun olmasın) herkes bu sayfalara erişebilmeli.
const router = Router();

router.get('/rival/:id', getRivalSharePage);
router.get('/tournament/:id', getTournamentSharePage);
router.get('/match/:id', getMatchSharePage);
router.get('/post/:id', getPostSharePage);

export default router;
