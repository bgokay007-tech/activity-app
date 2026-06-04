import { Router } from 'express';
import {
    createPost,
    getPosts,
    toggleLike,
    addComment,
    getComments,
    deletePost,
} from '../controllers/post.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authenticate, getPosts);
router.post('/', authenticate, createPost);
router.post('/:id/like', authenticate, toggleLike);
router.post('/:id/comment', authenticate, addComment);
router.get('/:id/comments', authenticate, getComments);
router.delete('/:id', authenticate, deletePost);

export default router;