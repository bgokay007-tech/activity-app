import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    listSaved, savedIds, savePost, unsavePost, saveMusic, unsaveMusic,
    getLists, createList, renameList, deleteList, getList, addListItem, removeListItem,
} from '../controllers/saved.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', listSaved);
router.get('/ids', savedIds);
router.post('/posts/:postId', savePost);
router.delete('/posts/:postId', unsavePost);
router.post('/music', saveMusic);
router.delete('/music/:id', unsaveMusic);

router.get('/lists', getLists);
router.post('/lists', createList);
router.patch('/lists/:id', renameList);
router.delete('/lists/:id', deleteList);
router.get('/lists/:id', getList);
router.post('/lists/:id/items', addListItem);
router.delete('/lists/:id/items/:postId', removeListItem);

export default router;
