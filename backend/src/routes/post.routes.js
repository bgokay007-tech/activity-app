import { Router } from 'express';
import {
    createPost, getPosts, getUserPosts,
    analyzeContent, toggleLike, addComment,
    getComments, editPost, toggleVisibility, deletePost,
    recordView, getStoryViews,
} from '../controllers/post.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/',                  authenticate, getPosts);
router.post('/',                 authenticate, createPost);
router.post('/analyze',          authenticate, analyzeContent);
router.get('/user/:userId',      authenticate, getUserPosts);
router.post('/:id/like',         authenticate, toggleLike);
router.post('/:id/comment',      authenticate, addComment);
router.get('/:id/comments',      authenticate, getComments);
router.patch('/:id',             authenticate, editPost);
router.patch('/:id/visibility',  authenticate, toggleVisibility);
router.delete('/:id',            authenticate, deletePost);
router.post('/:id/view',         authenticate, recordView);
router.get('/:id/views',         authenticate, getStoryViews);

export default router;
