import { Router } from 'express';
import { getRivalSharePage, getTournamentSharePage } from '../controllers/share.controller.js';

// Auth YOK — WhatsApp/Telegram/Instagram önizleme botları ve link'e tıklayan
// (uygulaması olsun olmasın) herkes bu sayfalara erişebilmeli.
const router = Router();

router.get('/rival/:id', getRivalSharePage);
router.get('/tournament/:id', getTournamentSharePage);

export default router;
