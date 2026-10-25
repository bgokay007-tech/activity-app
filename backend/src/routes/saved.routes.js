import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { listSaved, savedIds, savePost, unsavePost, saveMusic, unsaveMusic } from '../controllers/saved.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', listSaved);
router.get('/ids', savedIds);
router.post('/posts/:postId', savePost);
router.delete('/posts/:postId', unsavePost);
router.post('/music', saveMusic);
router.delete('/music/:id', unsaveMusic);

export default router;
